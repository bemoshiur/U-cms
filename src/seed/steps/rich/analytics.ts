import type { Payload } from 'payload'

import type { SeedStep } from '../../types'
import { aggregateTrafficForDate, utcDayString } from '../../../site/trafficAggregation'
import { RICH_ADMIN_ACCOUNTS, daysAgoISO, siteIdBySiteId } from './shared'

/**
 * Rich statistics data (owner mandate: the Phase-5 dashboards must show real
 * charts/tables, not zeros — refs 2-17..2-20). Layered on top of the minimal
 * `statisticsStep`: ~3 weeks of daily page views across varied OS / browser /
 * device / menu, rolled up into `trafficDaily`; a spread of satisfaction ratings
 * across menus and scores; and non-zero download counts on the gallery /
 * data-library posts.
 *
 * Idempotent via sentinels: seeded page views carry a `seed-rich` sessionKey and
 * seeded ratings a `seed-rich` ipHash, so a re-run (and accumulated real
 * traffic) is never duplicated.
 */

const DEVICES: ('mobile' | 'desktop')[] = ['desktop', 'desktop', 'mobile', 'desktop', 'mobile']
const OSES = ['windows', 'macos', 'ios', 'android', 'linux']
const BROWSERS = ['chrome', 'safari', 'edge', 'firefox', 'samsung']

async function menuByName(
  payload: Payload,
  tenantId: number,
  name: string,
): Promise<{ id: number; menuNumber: number } | undefined> {
  const found = await payload.find({
    collection: 'menus',
    where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: name } }] },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const doc = found.docs[0] as { id: number; menuNumber?: number } | undefined
  if (!doc || typeof doc.menuNumber !== 'number') {
    return undefined
  }
  return { id: doc.id, menuNumber: doc.menuNumber }
}

export const richStatisticsStep: SeedStep = {
  name: 'rich-statistics',
  async run(payload: Payload) {
    const tenantId = await siteIdBySiteId(payload, 'demo')

    // ── page views over ~3 weeks + daily rollups ────────────────────────────
    const seededMarker = await payload.find({
      collection: 'pageViews',
      where: { and: [{ tenant: { equals: tenantId } }, { sessionKey: { like: 'seed-rich' } }] },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (seededMarker.docs.length === 0) {
      const greeting = await menuByName(payload, tenantId, 'Greeting')
      const online = await menuByName(payload, tenantId, 'Online Services')

      const paths: { path: string; menu?: number }[] = [
        { path: '/' },
        { path: '/notices' },
        { path: '/press-releases' },
        ...(greeting ? [{ path: `/page/${greeting.menuNumber}`, menu: greeting.id }] : []),
        ...(online ? [{ path: `/page/${online.menuNumber}`, menu: online.id }] : []),
      ]

      const days = new Set<string>()
      let n = 0
      // 21 days back to yesterday (never "today", so real same-day traffic can't
      // make a seeded rollup stale), ~6 views/day with varied dimensions.
      for (let dayOffset = 1; dayOffset <= 21; dayOffset++) {
        const viewsThisDay = 4 + (dayOffset % 4)
        for (let v = 0; v < viewsThisDay; v++) {
          const p = paths[(n + v) % paths.length] as { path: string; menu?: number }
          const ts = new Date(Date.now() - dayOffset * 86_400_000)
          ts.setUTCHours(8 + (v % 10), (n * 7) % 60, 0, 0)
          days.add(utcDayString(ts))
          await payload.create({
            collection: 'pageViews',
            data: {
              tenant: tenantId,
              path: p.path,
              ...(p.menu ? { menu: p.menu } : {}),
              deviceType: DEVICES[n % DEVICES.length],
              osFamily: OSES[n % OSES.length],
              browserFamily: BROWSERS[n % BROWSERS.length],
              referrerHost: n % 5 === 0 ? 'search.example.com' : null,
              sessionKey: `seed-rich-s${n % 25}`,
              ts: ts.toISOString(),
            } as never,
            overrideAccess: true,
          })
          n++
        }
      }
      for (const day of days) {
        await aggregateTrafficForDate(payload, { tenantId, date: day })
      }
      payload.logger.info(`[seed:rich-statistics] created ${n} page views + ${days.size} rollups.`)
    }

    // ── satisfaction ratings across menus + scores ──────────────────────────
    const ratingMarker = await payload.find({
      collection: 'satisfactionRatings',
      where: { and: [{ tenant: { equals: tenantId } }, { ipHash: { like: 'seed-rich' } }] },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (ratingMarker.docs.length === 0) {
      const targets = [
        await menuByName(payload, tenantId, 'Greeting'),
        await menuByName(payload, tenantId, 'Online Services'),
        await menuByName(payload, tenantId, 'Organization'),
      ].filter((m): m is { id: number; menuNumber: number } => m !== undefined)

      if (targets.length > 0) {
        // Distribution skewed positive (realistic): more 4/5 than 1/2.
        const scorePattern = [5, 4, 5, 3, 4, 5, 2, 4, 5, 3, 4, 1, 5, 4, 3]
        let count = 0
        for (const menu of targets) {
          for (let i = 0; i < scorePattern.length; i++) {
            await payload.create({
              collection: 'satisfactionRatings',
              data: {
                tenant: tenantId,
                menu: menu.id,
                pageKey: `/page/${menu.menuNumber}`,
                score: scorePattern[i],
                member: null,
                submittedAt: daysAgoISO((i % 20) + 1, 14),
                ipHash: `seed-rich-${menu.id}-${i}`,
              } as never,
              overrideAccess: true,
            })
            count++
          }
        }
        payload.logger.info(`[seed:rich-statistics] created ${count} satisfaction ratings.`)
      }
    }

    // ── download counts on gallery / data-library posts ─────────────────────
    const boards = await payload.find({
      collection: 'boards',
      where: {
        and: [{ tenant: { equals: tenantId } }, { name: { in: ['Gallery', 'Attachment Board'] } }],
      },
      limit: 10,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    const boardIds = boards.docs.map((b) => b.id)
    if (boardIds.length > 0) {
      const posts = await payload.find({
        collection: 'posts',
        where: { board: { in: boardIds } },
        limit: 40,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      let bumped = 0
      for (const [i, post] of posts.docs.entries()) {
        const attachments = Array.isArray(post.attachments) ? post.attachments : []
        if (attachments.length === 0 || (attachments[0]?.downloadCount ?? 0) !== 0) {
          continue
        }
        const updated = attachments.map((a, idx) =>
          idx === 0 ? { ...a, downloadCount: 5 + ((i * 7) % 90) } : a,
        )
        await payload.update({
          collection: 'posts',
          id: post.id,
          data: { attachments: updated } as never,
          overrideAccess: true,
          context: { skipPostSideEffects: true },
        })
        bumped++
      }
      if (bumped > 0) {
        payload.logger.info(`[seed:rich-statistics] seeded download counts on ${bumped} posts.`)
      }
    }
  },
}

/**
 * Realistic privacy-history data (owner mandate: the login-history + access-
 * history views + their stats must not be empty — refs 3-5..3-7, 1-55/2-20).
 * Seeds login-history rows (successes, failures, one overseas, mobile) and a
 * set of access-history rows across the seeded admins. Both collections are
 * append-only + system-written; the seed uses `overrideAccess`. Idempotent via
 * sentinels (a `seed-rich` userAgent marker on login history; a distinctive
 * actorLabel on access logs).
 */
export const richPrivacyHistoryStep: SeedStep = {
  name: 'rich-privacy-history',
  async run(payload: Payload) {
    // ── login history ───────────────────────────────────────────────────────
    const loginMarker = await payload.find({
      collection: 'loginHistory',
      where: { userAgent: { like: 'seed-rich' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (loginMarker.docs.length === 0) {
      type LoginRow = {
        userLabel: string
        loginId: string
        success: boolean
        failReason?: string
        isOverseas?: boolean
        isMobile?: boolean
        dayOffset: number
      }
      const rows: LoginRow[] = [
        { userLabel: 'System Administrator', loginId: 'admin', success: true, dayOffset: 1 },
        { userLabel: 'Claire Bennett', loginId: 'content-editor', success: true, dayOffset: 1 },
        {
          userLabel: 'Claire Bennett',
          loginId: 'content-editor',
          success: true,
          isMobile: true,
          dayOffset: 2,
        },
        { userLabel: 'Erin Park', loginId: 'comms-admin', success: true, dayOffset: 2 },
        { userLabel: 'Daniel Cho', loginId: 'privacy-officer', success: true, dayOffset: 3 },
        { userLabel: 'Felix Nam', loginId: 'stats-analyst', success: true, dayOffset: 3 },
        {
          userLabel: 'Claire Bennett',
          loginId: 'content-editor',
          success: false,
          failReason: 'Invalid password',
          dayOffset: 4,
        },
        {
          userLabel: 'Unknown',
          loginId: 'admin',
          success: false,
          failReason: 'Invalid password',
          dayOffset: 4,
        },
        {
          userLabel: 'Unknown',
          loginId: 'testuser',
          success: false,
          failReason: 'Account not found',
          isOverseas: true,
          dayOffset: 5,
        },
        {
          userLabel: 'System Administrator',
          loginId: 'admin',
          success: true,
          isOverseas: true,
          dayOffset: 6,
        },
        {
          userLabel: 'Erin Park',
          loginId: 'comms-admin',
          success: true,
          isMobile: true,
          dayOffset: 7,
        },
        { userLabel: 'Felix Nam', loginId: 'stats-analyst', success: true, dayOffset: 8 },
        {
          userLabel: 'Daniel Cho',
          loginId: 'privacy-officer',
          success: false,
          failReason: 'Two-factor code incorrect',
          dayOffset: 9,
        },
        { userLabel: 'System Administrator', loginId: 'admin', success: true, dayOffset: 10 },
        { userLabel: 'Claire Bennett', loginId: 'content-editor', success: true, dayOffset: 11 },
        { userLabel: 'Erin Park', loginId: 'comms-admin', success: true, dayOffset: 12 },
        {
          userLabel: 'Unknown',
          loginId: 'admin',
          success: false,
          failReason: 'Invalid password',
          dayOffset: 13,
        },
        {
          userLabel: 'Felix Nam',
          loginId: 'stats-analyst',
          success: true,
          isMobile: true,
          dayOffset: 14,
        },
      ]
      for (const [i, r] of rows.entries()) {
        await payload.create({
          collection: 'loginHistory',
          data: {
            userLabel: r.userLabel,
            loginId: r.loginId,
            success: r.success,
            failReason: r.failReason ?? null,
            ipAddress: r.isOverseas ? '203.0.113.42' : `10.0.0.${20 + (i % 200)}`,
            isOverseas: r.isOverseas ?? false,
            isMobile: r.isMobile ?? false,
            userAgent: r.isMobile
              ? 'Mozilla/5.0 (iPhone) seed-rich'
              : 'Mozilla/5.0 (Windows NT 10.0) seed-rich',
            createdAt: daysAgoISO(r.dayOffset, 8),
          } as never,
          overrideAccess: true,
        })
      }
      payload.logger.info(`[seed:rich-privacy-history] created ${rows.length} login-history rows.`)
    }

    // ── access history ───────────────────────────────────────────────────────
    const sentinelLabel = 'Claire Bennett(content-editor)'
    const accessMarker = await payload.find({
      collection: 'accessLogs',
      where: { actorLabel: { equals: sentinelLabel } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (accessMarker.docs.length === 0) {
      const editor = `${RICH_ADMIN_ACCOUNTS[0]?.name}(${RICH_ADMIN_ACCOUNTS[0]?.loginId})`
      const analyst = `${RICH_ADMIN_ACCOUNTS[3]?.name}(${RICH_ADMIN_ACCOUNTS[3]?.loginId})`
      const officer = `${RICH_ADMIN_ACCOUNTS[1]?.name}(${RICH_ADMIN_ACCOUNTS[1]?.loginId})`
      type AccessRow = {
        actorLabel: string
        action: 'login' | 'logout' | 'list' | 'view' | 'create' | 'update' | 'delete'
        menuKey: string
        menuLabel: string
        url: string
        dayOffset: number
      }
      const rows: AccessRow[] = [
        {
          actorLabel: editor,
          action: 'login',
          menuKey: 'system.admins',
          menuLabel: 'Login',
          url: '/admin/login',
          dayOffset: 1,
        },
        {
          actorLabel: editor,
          action: 'list',
          menuKey: 'content.posts',
          menuLabel: 'Post Management',
          url: '/admin/collections/posts',
          dayOffset: 1,
        },
        {
          actorLabel: editor,
          action: 'create',
          menuKey: 'content.posts',
          menuLabel: 'Post Management',
          url: '/admin/collections/posts/create',
          dayOffset: 1,
        },
        {
          actorLabel: editor,
          action: 'update',
          menuKey: 'content.boards',
          menuLabel: 'Board Management',
          url: '/admin/collections/boards',
          dayOffset: 2,
        },
        {
          actorLabel: editor,
          action: 'view',
          menuKey: 'content.menus',
          menuLabel: 'Menu Management',
          url: '/admin/collections/menus',
          dayOffset: 2,
        },
        {
          actorLabel: analyst,
          action: 'login',
          menuKey: 'system.admins',
          menuLabel: 'Login',
          url: '/admin/login',
          dayOffset: 3,
        },
        {
          actorLabel: analyst,
          action: 'view',
          menuKey: 'statistics.traffic',
          menuLabel: 'Traffic Statistics',
          url: '/admin/traffic-statistics',
          dayOffset: 3,
        },
        {
          actorLabel: analyst,
          action: 'view',
          menuKey: 'statistics.satisfaction',
          menuLabel: 'Satisfaction Statistics',
          url: '/admin/satisfaction-statistics',
          dayOffset: 4,
        },
        {
          actorLabel: officer,
          action: 'login',
          menuKey: 'system.admins',
          menuLabel: 'Login',
          url: '/admin/login',
          dayOffset: 5,
        },
        {
          actorLabel: officer,
          action: 'list',
          menuKey: 'privacy.accessLogs',
          menuLabel: 'Access History',
          url: '/admin/access-history',
          dayOffset: 5,
        },
        {
          actorLabel: officer,
          action: 'list',
          menuKey: 'privacy.loginHistory',
          menuLabel: 'Login History',
          url: '/admin/collections/loginHistory',
          dayOffset: 6,
        },
        {
          actorLabel: editor,
          action: 'update',
          menuKey: 'content.webContents',
          menuLabel: 'Web Content Management',
          url: '/admin/collections/webContents',
          dayOffset: 7,
        },
        {
          actorLabel: editor,
          action: 'delete',
          menuKey: 'content.posts',
          menuLabel: 'Post Management',
          url: '/admin/collections/posts',
          dayOffset: 8,
        },
        {
          actorLabel: editor,
          action: 'logout',
          menuKey: 'system.admins',
          menuLabel: 'Logout',
          url: '/admin/logout',
          dayOffset: 8,
        },
      ]
      for (const [i, r] of rows.entries()) {
        await payload.create({
          collection: 'accessLogs',
          data: {
            actor: null,
            actorLabel: r.actorLabel,
            action: r.action,
            menuKey: r.menuKey,
            menuLabel: r.menuLabel,
            url: r.url,
            ipAddress: `10.0.0.${20 + (i % 200)}`,
            sessionLoginAt: daysAgoISO(r.dayOffset, 8),
            createdAt: daysAgoISO(r.dayOffset, 9),
          } as never,
          overrideAccess: true,
        })
      }
      payload.logger.info(`[seed:rich-privacy-history] created ${rows.length} access-history rows.`)
    }
  },
}
