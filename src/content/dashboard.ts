import { compareAdminNotices, type AdminNoticeOrderItem } from './display'

/**
 * Pure admin-dashboard helpers (Task 5D; refs 1-7 / 1-8 — the permission-filtered
 * landing dashboard). No Payload runtime dependency, so the widget-selection and
 * list-shaping logic is unit-tested in isolation (mirrors `content/display.ts` /
 * `content/trafficStats.ts`) and shared by the server read-side
 * (`src/site/dashboardData.ts`).
 *
 * The load-bearing rule this file encodes is PERMISSION FILTERING (ref 1-7): a
 * widget is only ever shown — and, upstream, only ever QUERIED — when the admin
 * holds the backing menu grant. `resolveVisibleWidgets` /
 * `resolveVisibleMetricCards` are that decision, kept pure so the "two admins
 * with different grants see different widget sets" invariant is provable without
 * booting Payload.
 */

/** The main dashboard widget cards, each gated on a backing admin-menu grant. */
export type DashboardWidgetKey =
  | 'traffic'
  | 'adminNotices'
  | 'notificationAreas'
  | 'recentPosts'
  | 'banners'
  | 'errorSummary'
  | 'quickMenu'

/** A widget definition: its stable key, the menuKey that gates it, and links. */
export type WidgetDef = {
  key: DashboardWidgetKey
  /** The admin-menu grant required to see this widget. `null` = always shown. */
  menuKey: string | null
  title: string
  /** "View all" link to the backing module (admin route), when applicable. */
  href: string | null
}

/**
 * The full widget catalogue (declaration order = render order). `quickMenu`
 * (profile + idle-logout + quick links) has no menuKey — every signed-in admin
 * sees their own quick menu.
 */
export const DASHBOARD_WIDGETS: readonly WidgetDef[] = [
  {
    key: 'traffic',
    menuKey: 'statistics.traffic',
    title: 'Traffic',
    href: '/admin/traffic-statistics',
  },
  {
    key: 'adminNotices',
    menuKey: 'content.adminNotices',
    title: 'Administrator Notices',
    href: '/admin/collections/adminNotices',
  },
  {
    key: 'notificationAreas',
    menuKey: 'content.notificationAreas',
    title: 'Notification Areas',
    href: '/admin/collections/notificationAreas',
  },
  {
    key: 'recentPosts',
    menuKey: 'content.posts',
    title: 'Recent Posts & Q&A',
    href: '/admin/collections/posts',
  },
  {
    key: 'banners',
    menuKey: 'content.banners',
    title: 'Banners',
    href: '/admin/collections/banners',
  },
  {
    key: 'errorSummary',
    menuKey: 'system.errorLogs',
    title: 'System Errors',
    href: '/admin/error-statistics',
  },
  { key: 'quickMenu', menuKey: null, title: 'Quick Menu', href: null },
] as const

/** A single "today's metrics" stat card, gated on its own backing grant. */
export type MetricCardKey =
  'visitorsToday' | 'pageViewsToday' | 'newMembersToday' | 'postsToday' | 'postsTotal'

export type MetricCardDef = {
  key: MetricCardKey
  menuKey: string
  label: string
}

/** The stat cards across the top of the dashboard, each independently gated. */
export const METRIC_CARDS: readonly MetricCardDef[] = [
  { key: 'visitorsToday', menuKey: 'statistics.traffic', label: "Today's visitors" },
  { key: 'pageViewsToday', menuKey: 'statistics.traffic', label: "Today's page views" },
  { key: 'newMembersToday', menuKey: 'members.manage', label: 'New members today' },
  { key: 'postsToday', menuKey: 'content.posts', label: 'Posts today' },
  { key: 'postsTotal', menuKey: 'content.posts', label: 'Total posts' },
] as const

/**
 * The widgets a viewer may see, given the set of menuKeys they hold (a
 * super-admin holds every key — pass `isSuper: true`). Preserves catalogue
 * order. `quickMenu` (menuKey `null`) is always included. This is the pure
 * heart of the permission filter: the server read-side never loads a widget's
 * data unless its key appears here.
 */
export function resolveVisibleWidgets(
  grantedMenuKeys: ReadonlySet<string>,
  isSuper = false,
): DashboardWidgetKey[] {
  return DASHBOARD_WIDGETS.filter(
    (w) => w.menuKey === null || isSuper || grantedMenuKeys.has(w.menuKey),
  ).map((w) => w.key)
}

/** The stat cards a viewer may see, given the menuKeys they hold. */
export function resolveVisibleMetricCards(
  grantedMenuKeys: ReadonlySet<string>,
  isSuper = false,
): MetricCardKey[] {
  return METRIC_CARDS.filter((c) => isSuper || grantedMenuKeys.has(c.menuKey)).map((c) => c.key)
}

/** A post as consumed by the dashboard list widgets (only the fields we render). */
export type DashPost = {
  id: string | number
  title?: string | null
  boardKind?: string | null
  isSecret?: boolean | null
  viewCount?: number | null
  createdAt?: string | Date | null
  isAnswered?: boolean | null
  boardName?: string | null
}

function toEpoch(value: string | Date | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Drops secret (비공개) posts — the dashboard is a summary surface and MUST NOT
 * surface a secret post's title/metadata (ref 1-7 "no widget leaks data the
 * admin can't access"). Defense-in-depth: the DB queries already filter
 * `isSecret != true`, and this re-filters whatever reaches the shaping layer.
 */
export function nonSecret(posts: readonly DashPost[]): DashPost[] {
  return posts.filter((p) => p.isSecret !== true)
}

/** The N most-viewed non-secret posts (viewCount desc, newest first on ties). */
export function mostViewed(posts: readonly DashPost[], n: number): DashPost[] {
  return nonSecret(posts)
    .slice()
    .sort((a, b) => {
      const byViews = (b.viewCount ?? 0) - (a.viewCount ?? 0)
      return byViews !== 0 ? byViews : toEpoch(b.createdAt) - toEpoch(a.createdAt)
    })
    .slice(0, Math.max(0, n))
}

/** The N most recent non-secret posts (newest first). */
export function recentPosts(posts: readonly DashPost[], n: number): DashPost[] {
  return nonSecret(posts)
    .slice()
    .sort((a, b) => toEpoch(b.createdAt) - toEpoch(a.createdAt))
    .slice(0, Math.max(0, n))
}

/** The N most recent non-secret Q&A questions (posts on a `qna`-kind board). */
export function recentQuestions(posts: readonly DashPost[], n: number): DashPost[] {
  return recentPosts(
    nonSecret(posts).filter((p) => p.boardKind === 'qna'),
    n,
  )
}

/** Sorts admin notices pinned-first, newest-first, and takes the top N. */
export function topNotices<T extends AdminNoticeOrderItem>(notices: readonly T[], n: number): T[] {
  return notices.slice().sort(compareAdminNotices).slice(0, Math.max(0, n))
}

/** Today's headline traffic figures from the day's rollup (absent → zeroes). */
export function todayTraffic(
  rollup: { totalViews?: number; uniqueVisitors?: number } | undefined,
): {
  pageViews: number
  visitors: number
} {
  return {
    pageViews: rollup?.totalViews ?? 0,
    visitors: rollup?.uniqueVisitors ?? 0,
  }
}
