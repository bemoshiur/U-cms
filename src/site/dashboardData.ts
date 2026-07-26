import type { Payload, PayloadRequest, Where } from 'payload'

import { hasMenuAccess, isSuperUser } from '../access/hasMenuAccess'
import {
  type DashboardWidgetKey,
  type DashPost,
  type MetricCardKey,
  METRIC_CARDS,
  mostViewed,
  recentPosts,
  recentQuestions,
  resolveVisibleMetricCards,
  resolveVisibleWidgets,
  todayTraffic,
  topNotices,
} from '../content/dashboard'
import { isLive } from '../content/display'
import { loadDailyRollups, buildStatsPayload } from './trafficStatsData'
import { utcDayBounds, utcDayString } from './trafficAggregation'

/**
 * Server read-side for the permission-filtered admin dashboard (Task 5D; refs
 * 1-7 / 1-8). ONE `loadDashboardData` entry point resolves the viewer's grants
 * ONCE (via the authoritative async `hasMenuAccess`), then loads ONLY the
 * widgets they may see — a widget whose backing menu the admin can't access is
 * neither rendered NOR queried (ref 1-7). Every per-site query is scoped to the
 * resolved `tenantId`, so a site-A dashboard can never surface site-B data.
 *
 * ## Why `overrideAccess: true` on the loads
 *
 * `loadDashboardData` gates each widget on its OWN backing menuKey up front
 * (e.g. the recent-posts widget requires `content.posts`, the notices widget
 * `content.adminNotices`) and constrains every query to the caller's resolved
 * site. Because that authorization + tenant boundary is enforced here, the
 * underlying reads run with `overrideAccess: true` — the same posture the sibling
 * statistics views/endpoints use (see `downloadStatsData.ts`), and necessary
 * because some widgets (traffic) are gated on a DIFFERENT key than the collection
 * they read. The tenant `where` is the load-bearing isolation boundary.
 */

/**
 * §3 security-document exclusion (Task 6D phase-6 fix). The dashboard widgets +
 * post aggregates are gated on `content.posts`, NOT the privacy grant, so a
 * content-only admin must never see §3 security-doc post titles / board names /
 * view-counts (unlogged) in Recent-Posts / Most-Viewed / Q&A nor have them
 * counted in postsToday / postsTotal. Mirrors NOT_SECURITY_DOC in
 * `src/site/board.ts` + the L1 exclusion in `downloadStatsData.ts`.
 * `not_equals: true` compiles to `(col IS NULL OR col <> true)`, so ordinary/
 * legacy posts (NULL/false) are unaffected.
 */
const NOT_SECURITY_DOC: Where = { securityDoc: { not_equals: true } }

/** How many rows each list widget shows. */
const NOTICE_LIMIT = 5
const NOTIFICATION_LIMIT = 5
const POST_LIMIT = 5
const BANNER_LIMIT = 8

export type DashboardMetricCard = {
  key: MetricCardKey
  label: string
  value: number
}

export type DashboardNotice = {
  id: string | number
  title: string
  pinned: boolean
  author: string | null
  createdAt: string | null
}

export type DashboardListItem = {
  id: string | number
  title: string
}

export type DashboardPostRow = {
  id: string | number
  title: string
  boardName: string | null
  viewCount: number
  createdAt: string | null
  isAnswered: boolean
}

export type DashboardBanner = {
  id: string | number
  title: string
  imageUrl: string | null
}

export type DashboardTraffic = {
  range: 'week' | 'month'
  totalViews: number
  uniqueVisitors: number
  series: { period: string; totalViews: number; uniqueVisitors: number }[]
}

export type DashboardData = {
  /** The site this dashboard is scoped to. */
  siteId: string | number
  visibleWidgets: DashboardWidgetKey[]
  metricCards: DashboardMetricCard[]
  today: { visitors: number; pageViews: number } | null
  traffic: DashboardTraffic | null
  notices: DashboardNotice[] | null
  notifications: DashboardListItem[] | null
  recent: DashboardPostRow[] | null
  mostViewed: DashboardPostRow[] | null
  questions: DashboardPostRow[] | null
  banners: DashboardBanner[] | null
  errorSummary: { todayCount: number; totalCount: number } | null
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function toPostRow(doc: Record<string, unknown>): DashboardPostRow {
  const board = doc.board as { name?: unknown } | null | undefined
  return {
    id: doc.id as string | number,
    title: str(doc.title) ?? String(doc.id ?? ''),
    boardName: board && typeof board === 'object' ? (str(board.name) ?? null) : null,
    viewCount: typeof doc.viewCount === 'number' ? doc.viewCount : 0,
    createdAt: str(doc.createdAt),
    isAnswered: doc.isAnswered === true,
  }
}

function toDashPost(doc: Record<string, unknown>): DashPost {
  return {
    id: doc.id as string | number,
    title: str(doc.title),
    boardKind: str(doc.boardKind),
    isSecret: doc.isSecret === true,
    viewCount: typeof doc.viewCount === 'number' ? doc.viewCount : 0,
    createdAt: str(doc.createdAt),
    isAnswered: doc.isAnswered === true,
    boardName: null,
  }
}

/**
 * Resolves which menuKeys the viewer holds, calling the authoritative async
 * `hasMenuAccess` once per DISTINCT key the dashboard cares about. A super-admin
 * short-circuits to "all granted". Returns a set of granted keys (used by the
 * pure `resolveVisibleWidgets` / `resolveVisibleMetricCards`).
 */
async function resolveGrants(
  req: PayloadRequest,
): Promise<{ granted: Set<string>; isSuper: boolean }> {
  const isSuper = isSuperUser(req.user)
  const granted = new Set<string>()
  if (isSuper) {
    return { granted, isSuper }
  }
  const keys = new Set<string>()
  for (const c of METRIC_CARDS) keys.add(c.menuKey)
  keys.add('statistics.traffic')
  keys.add('content.adminNotices')
  keys.add('content.notificationAreas')
  keys.add('content.posts')
  keys.add('content.banners')
  keys.add('system.errorLogs')
  for (const key of keys) {
    if (await hasMenuAccess(req, key)) {
      granted.add(key)
    }
  }
  return { granted, isSuper }
}

function has(granted: Set<string>, isSuper: boolean, key: string): boolean {
  return isSuper || granted.has(key)
}

/**
 * Loads the full permission-filtered dashboard payload for one admin, scoped to
 * one site. Each `payload.count`/`payload.find` below is guarded by a grant
 * check, so an ungranted widget costs ZERO queries.
 */
export async function loadDashboardData(args: {
  payload: Payload
  req: PayloadRequest
  tenantId: string | number
  range?: 'week' | 'month'
  now?: Date
}): Promise<DashboardData> {
  const { payload, req, tenantId } = args
  const now = args.now ?? new Date()
  const range: 'week' | 'month' = args.range === 'month' ? 'month' : 'week'
  const { granted, isSuper } = await resolveGrants(req)

  const visibleWidgets = resolveVisibleWidgets(granted, isSuper)
  const visibleMetricKeys = new Set(resolveVisibleMetricCards(granted, isSuper))

  const today = utcDayString(now)
  const { start: todayStart } = utcDayBounds(today)

  const canTraffic = has(granted, isSuper, 'statistics.traffic')
  const canMembers = has(granted, isSuper, 'members.manage')
  const canPosts = has(granted, isSuper, 'content.posts')

  // ── Today's headline traffic (one rollup doc) — only if traffic-granted ──
  let todayHeadline: { visitors: number; pageViews: number } | null = null
  if (canTraffic) {
    const rollups = await loadDailyRollups(payload, {
      tenantId,
      from: today,
      to: today,
      overrideAccess: true,
      req,
    })
    const t = todayTraffic(rollups[0])
    todayHeadline = { visitors: t.visitors, pageViews: t.pageViews }
  }

  // ── Metric card values (each only computed when its card is visible) ──
  const metricValues: Partial<Record<MetricCardKey, number>> = {}
  if (visibleMetricKeys.has('visitorsToday')) {
    metricValues.visitorsToday = todayHeadline?.visitors ?? 0
  }
  if (visibleMetricKeys.has('pageViewsToday')) {
    metricValues.pageViewsToday = todayHeadline?.pageViews ?? 0
  }
  if (visibleMetricKeys.has('newMembersToday') && canMembers) {
    const r = await payload.count({
      collection: 'members',
      where: {
        and: [{ tenant: { equals: tenantId } }, { createdAt: { greater_than_equal: todayStart } }],
      },
      overrideAccess: true,
      req,
    })
    metricValues.newMembersToday = r.totalDocs
  }
  if (canPosts && (visibleMetricKeys.has('postsToday') || visibleMetricKeys.has('postsTotal'))) {
    if (visibleMetricKeys.has('postsToday')) {
      const r = await payload.count({
        collection: 'posts',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { createdAt: { greater_than_equal: todayStart } },
            NOT_SECURITY_DOC,
          ],
        },
        overrideAccess: true,
        req,
      })
      metricValues.postsToday = r.totalDocs
    }
    if (visibleMetricKeys.has('postsTotal')) {
      const r = await payload.count({
        collection: 'posts',
        where: { and: [{ tenant: { equals: tenantId } }, NOT_SECURITY_DOC] },
        overrideAccess: true,
        req,
      })
      metricValues.postsTotal = r.totalDocs
    }
  }

  const metricCards: DashboardMetricCard[] = METRIC_CARDS.filter(
    (c) => visibleMetricKeys.has(c.key) && metricValues[c.key] !== undefined,
  ).map((c) => ({ key: c.key, label: c.label, value: metricValues[c.key] ?? 0 }))

  // ── Traffic chart (week/month) ──
  let traffic: DashboardTraffic | null = null
  if (canTraffic) {
    const days = range === 'month' ? 29 : 6
    const from = utcDayString(new Date(now.getTime() - days * 86_400_000))
    const dailies = await loadDailyRollups(payload, {
      tenantId,
      from,
      to: today,
      overrideAccess: true,
      req,
    })
    const stats = buildStatsPayload(dailies, { from, to: today, granularity: 'daily' })
    traffic = {
      range,
      totalViews: stats.totalViews,
      uniqueVisitors: stats.uniqueVisitors,
      series: stats.period.map((p) => ({
        period: p.period,
        totalViews: p.totalViews,
        uniqueVisitors: p.uniqueVisitors,
      })),
    }
  }

  // ── Admin notices (pinned first) ──
  let notices: DashboardNotice[] | null = null
  if (has(granted, isSuper, 'content.adminNotices')) {
    const found = await payload.find({
      collection: 'adminNotices',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      limit: 50,
      pagination: false,
      overrideAccess: true,
      req,
    })
    notices = topNotices(
      (found.docs as unknown as Record<string, unknown>[]).map((d) => ({
        id: d.id as string | number,
        title: str(d.title) ?? '(untitled)',
        pinned: d.noticeType === 'pinned',
        author: str(d.author),
        createdAt: str(d.createdAt),
        noticeType: str(d.noticeType),
      })),
      NOTICE_LIMIT,
    ).map((n) => ({
      id: n.id,
      title: n.title,
      pinned: n.pinned,
      author: n.author,
      createdAt: n.createdAt,
    }))
  }

  // ── Notification-area items (live first) ──
  let notifications: DashboardListItem[] | null = null
  if (has(granted, isSuper, 'content.notificationAreas')) {
    const found = await payload.find({
      collection: 'notificationAreas',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      sort: 'displayOrder',
      limit: 50,
      pagination: false,
      overrideAccess: true,
      req,
    })
    const docs = found.docs as unknown as Record<string, unknown>[]
    const live = docs.filter((d) => isLive(d as never, now))
    const chosen = (live.length > 0 ? live : docs).slice(0, NOTIFICATION_LIMIT)
    notifications = chosen.map((d) => ({
      id: d.id as string | number,
      title: str(d.title) ?? '(untitled)',
    }))
  }

  // ── Recent posts + most-viewed + Q&A (secret-filtered, tenant-scoped) ──
  let recent: DashboardPostRow[] | null = null
  let mostViewedRows: DashboardPostRow[] | null = null
  let questions: DashboardPostRow[] | null = null
  if (canPosts) {
    const found = await payload.find({
      collection: 'posts',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { isSecret: { not_equals: true } },
          NOT_SECURITY_DOC,
        ],
      },
      depth: 1,
      limit: 200,
      pagination: false,
      overrideAccess: true,
      req,
    })
    const rawDocs = found.docs as unknown as Record<string, unknown>[]
    const byId = new Map<string, Record<string, unknown>>(rawDocs.map((d) => [String(d.id), d]))
    const dashPosts = rawDocs.map(toDashPost)
    const rowFor = (p: DashPost): DashboardPostRow => toPostRow(byId.get(String(p.id))!)
    recent = recentPosts(dashPosts, POST_LIMIT).map(rowFor)
    mostViewedRows = mostViewed(dashPosts, POST_LIMIT).map(rowFor)
    questions = recentQuestions(dashPosts, POST_LIMIT).map(rowFor)
  }

  // ── Active banner strip ──
  let banners: DashboardBanner[] | null = null
  if (has(granted, isSuper, 'content.banners')) {
    const found = await payload.find({
      collection: 'banners',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      sort: 'displayOrder',
      limit: 50,
      pagination: false,
      overrideAccess: true,
      req,
    })
    const docs = found.docs as unknown as Record<string, unknown>[]
    const live = docs.filter((d) => isLive(d as never, now))
    banners = (live.length > 0 ? live : docs).slice(0, BANNER_LIMIT).map((d) => {
      const image = d.image as { url?: unknown } | null | undefined
      return {
        id: d.id as string | number,
        title: str(d.title) ?? '(untitled)',
        imageUrl: image && typeof image === 'object' ? (str(image.url) ?? null) : null,
      }
    })
  }

  // ── Error summary (errorLogs is GLOBAL/system-wide, gated on system.errorLogs) ──
  let errorSummary: { todayCount: number; totalCount: number } | null = null
  if (has(granted, isSuper, 'system.errorLogs')) {
    const todayCount = await payload.count({
      collection: 'errorLogs',
      where: { occurredAt: { greater_than_equal: todayStart } },
      overrideAccess: true,
      req,
    })
    const totalCount = await payload.count({
      collection: 'errorLogs',
      overrideAccess: true,
      req,
    })
    errorSummary = { todayCount: todayCount.totalDocs, totalCount: totalCount.totalDocs }
  }

  return {
    siteId: tenantId,
    visibleWidgets,
    metricCards,
    today: todayHeadline,
    traffic,
    notices,
    notifications,
    recent,
    mostViewed: mostViewedRows,
    questions,
    banners,
    errorSummary,
  }
}
