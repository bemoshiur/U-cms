import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { loadDashboardData } from '@/site/dashboardData'
import { utcDayString } from '@/site/trafficAggregation'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { boardTypesStep } from '@/seed/steps/boardTypes'
import { sitesStep } from '@/seed/steps/sites'

/**
 * Task 5D — the permission-filtered admin dashboard read-side. Boots real
 * Payload against Postgres and proves the load-bearing invariants:
 *  - a limited admin sees a SUBSET of the super-admin's widgets/metrics, and the
 *    ungranted widgets are `null` (not queried);
 *  - tenant scoping: a site-A dashboard never surfaces site-B data;
 *  - a secret post never appears in any list;
 *  - today's-metrics counts are correct.
 */

let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

function rand(): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  let out = ''
  while (n > 0) {
    out += String.fromCharCode(97 + (n % 26))
    n = Math.floor(n / 26)
  }
  return out
}
function uniqueSiteId(label: string): string {
  return `t${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}
async function adminMenuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id
}
async function boardTypeIdByCode(code: string): Promise<number> {
  const found = await payload.find({
    collection: 'boardTypes',
    where: { code: { equals: code } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id
}
async function makeSite(label: string): Promise<number> {
  const site = await payload.create({
    collection: 'sites',
    data: {
      siteId: uniqueSiteId(label),
      name: `${label} Site`,
      url: `https://${label}.example.com`,
      isAdminSite: false,
    },
    overrideAccess: true,
  })
  return site.id
}
async function makeBoard(tenantId: number, name: string, boardTypeCode: string): Promise<number> {
  const board = await payload.create({
    collection: 'boards',
    data: { tenant: tenantId, name, boardType: await boardTypeIdByCode(boardTypeCode) },
    overrideAccess: true,
  })
  return board.id
}
async function makePost(
  tenantId: number,
  boardId: number,
  fields: { title: string; isSecret?: boolean; viewCount?: number },
): Promise<number> {
  const post = await payload.create({
    collection: 'posts',
    data: { board: boardId, title: fields.title, isSecret: fields.isSecret ?? false } as never,
    overrideAccess: true,
  })
  if (fields.viewCount !== undefined) {
    // viewCount is field-access-locked to no-write; overrideAccess bypasses it.
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { viewCount: fields.viewCount } as never,
      overrideAccess: true,
      context: { skipPostSideEffects: true },
    })
  }
  // Guard against any inherited tenant mismatch (posts derive tenant from board).
  void tenantId
  return post.id
}
async function makeSuper(): Promise<Record<string, unknown>> {
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: `ROLE_DSUP_${rand().toUpperCase()}`,
      name: 'dash super',
      description: 'isSuper',
      isSuper: true,
    },
    overrideAccess: true,
  })
  const created = await payload.create({
    collection: 'users',
    data: {
      email: `dsup-${rand()}@example.com`,
      password: TEST_PASSWORD,
      roles: [role.id],
      status: 'active',
    } as never,
    overrideAccess: true,
  })
  // Re-fetch depth 1 so `roles` arrive populated (matches a real req.user, whose
  // auth.depth=1 populates roles — lets isSuperUser resolve synchronously).
  return payload.findByID({
    collection: 'users',
    id: created.id,
    depth: 1,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}
async function makeLimitedAdmin(
  menuKeys: string[],
  tenantIds: number[],
): Promise<Record<string, unknown>> {
  const grants = await Promise.all(menuKeys.map((k) => adminMenuId(k)))
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: `ROLE_DLIM_${rand().toUpperCase()}`,
      name: 'dash limited',
      description: 'limited grants',
      menuGrants: grants,
    },
    overrideAccess: true,
  })
  const created = await payload.create({
    collection: 'users',
    data: {
      email: `dlim-${rand()}@example.com`,
      password: TEST_PASSWORD,
      roles: [role.id],
      tenants: tenantIds.map((t) => ({ tenant: t })),
      status: 'active',
    } as never,
    overrideAccess: true,
  })
  return payload.findByID({
    collection: 'users',
    id: created.id,
    depth: 1,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}
async function makeMedia(): Promise<number> {
  const doc = await payload.create({
    collection: 'media',
    data: { alt: 'dash' } as never,
    file: {
      data: PNG_1x1,
      name: `dash-${rand()}.png`,
      mimetype: 'image/png',
      size: PNG_1x1.length,
    },
    overrideAccess: true,
  })
  return doc.id
}
function reqFor(user: Record<string, unknown>): PayloadRequest {
  return { user, payload } as unknown as PayloadRequest
}

describe('Task 5D — permission-filtered admin dashboard', () => {
  let siteA: number
  let siteB: number
  let superUser: Record<string, unknown>
  const now = new Date()
  const today = utcDayString(now)

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])
    superUser = await makeSuper()

    siteA = await makeSite(`da${rand().slice(0, 4)}`)
    siteB = await makeSite(`db${rand().slice(0, 4)}`)

    // ── Site A content ──
    const boardA = await makeBoard(siteA, 'A General', 'PG0001')
    const qnaA = await makeBoard(siteA, 'A Q&A', 'PG0003')
    await makePost(siteA, boardA, { title: 'A-Alpha', viewCount: 5 })
    await makePost(siteA, boardA, { title: 'A-Bravo-SECRET', isSecret: true, viewCount: 999 })
    await makePost(siteA, qnaA, { title: 'A-Charlie-Question', viewCount: 50 })

    await payload.create({
      collection: 'adminNotices',
      data: { tenant: siteA, title: 'A Pinned Notice', noticeType: 'pinned' } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'adminNotices',
      data: { tenant: siteA, title: 'A General Notice', noticeType: 'general' } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'notificationAreas',
      data: {
        tenant: siteA,
        title: 'A Notification',
        active: true,
        image: await makeMedia(),
      } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'banners',
      data: { tenant: siteA, title: 'A Banner', active: true, image: await makeMedia() } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'trafficDaily',
      data: {
        tenant: siteA,
        date: today,
        totalViews: 42,
        uniqueVisitors: 10,
        byPath: {},
        byOs: {},
        byBrowser: {},
        byDevice: {},
      } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'members',
      data: {
        email: `amem-${rand()}@example.com`,
        password: TEST_PASSWORD,
        loginId: `amem${rand().slice(0, 6)}`,
        name: 'A Member',
        status: 'active',
        tenant: siteA,
      } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'errorLogs',
      data: {
        occurredAt: now.toISOString(),
        exceptionClass: 'DashTestError',
        message: 'dash test error',
        statusCode: 500,
      } as never,
      overrideAccess: true,
    })

    // ── Site B content (must never leak into a site-A dashboard) ──
    const boardB = await makeBoard(siteB, 'B General', 'PG0001')
    await makePost(siteB, boardB, { title: 'B-Only-Post', viewCount: 7 })
    await payload.create({
      collection: 'adminNotices',
      data: { tenant: siteB, title: 'B-Only-Notice', noticeType: 'pinned' } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'trafficDaily',
      data: {
        tenant: siteB,
        date: today,
        totalViews: 500,
        uniqueVisitors: 300,
        byPath: {},
        byOs: {},
        byBrowser: {},
        byDevice: {},
      } as never,
      overrideAccess: true,
    })
  })

  it('super-admin sees every widget + all metric cards, secret post excluded', async () => {
    const data = await loadDashboardData({
      payload,
      req: reqFor(superUser),
      tenantId: siteA,
      now,
    })

    expect(data.visibleWidgets).toEqual([
      'traffic',
      'adminNotices',
      'notificationAreas',
      'recentPosts',
      'banners',
      'errorSummary',
      'quickMenu',
    ])
    expect(data.metricCards.map((c) => c.key)).toEqual([
      'visitorsToday',
      'pageViewsToday',
      'newMembersToday',
      'postsToday',
      'postsTotal',
    ])

    // Today's traffic reads site A's rollup (42/10), NOT site B's (500/300).
    expect(data.today).toEqual({ visitors: 10, pageViews: 42 })
    expect(data.metricCards.find((c) => c.key === 'pageViewsToday')!.value).toBe(42)
    expect(data.metricCards.find((c) => c.key === 'visitorsToday')!.value).toBe(10)

    // Posts: exactly the 3 site-A posts total; secret excluded from the lists.
    expect(data.metricCards.find((c) => c.key === 'postsTotal')!.value).toBe(3)
    expect(data.recent!.map((p) => p.title)).not.toContain('A-Bravo-SECRET')
    expect(data.mostViewed![0]!.title).toBe('A-Charlie-Question') // 50 > 5 (secret's 999 filtered)
    expect(data.questions!.map((p) => p.title)).toEqual(['A-Charlie-Question'])

    // Notices pinned-first; new-member + error widgets present.
    expect(data.notices![0]!.pinned).toBe(true)
    expect(data.notifications!.length).toBeGreaterThan(0)
    expect(data.banners!.length).toBeGreaterThan(0)
    expect(data.errorSummary!.todayCount).toBeGreaterThanOrEqual(1)
    expect(data.metricCards.find((c) => c.key === 'newMembersToday')!.value).toBeGreaterThanOrEqual(
      1,
    )

    // No site-B data anywhere in the payload.
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('B-Only-Post')
    expect(serialized).not.toContain('B-Only-Notice')
    // The secret post's title never leaks, even though it has the highest views.
    expect(serialized).not.toContain('A-Bravo-SECRET')
  })

  it('a limited admin (content.posts only) sees a SUBSET — ungranted widgets are null', async () => {
    const limited = await makeLimitedAdmin(['content.posts'], [siteA])
    const data = await loadDashboardData({
      payload,
      req: reqFor(limited),
      tenantId: siteA,
      now,
    })

    expect(data.visibleWidgets).toEqual(['recentPosts', 'quickMenu'])
    expect(data.metricCards.map((c) => c.key)).toEqual(['postsToday', 'postsTotal'])

    // Ungranted widgets are neither rendered NOR queried → null.
    expect(data.traffic).toBeNull()
    expect(data.today).toBeNull()
    expect(data.notices).toBeNull()
    expect(data.notifications).toBeNull()
    expect(data.banners).toBeNull()
    expect(data.errorSummary).toBeNull()

    // The one granted widget still works + still excludes the secret post.
    expect(data.recent).not.toBeNull()
    expect(data.recent!.map((p) => p.title)).not.toContain('A-Bravo-SECRET')
    expect(data.metricCards.find((c) => c.key === 'postsTotal')!.value).toBe(3)
  })

  it('a roleless admin sees ONLY the quick menu (no data widgets)', async () => {
    const roleless = await makeLimitedAdmin([], [siteA])
    const data = await loadDashboardData({
      payload,
      req: reqFor(roleless),
      tenantId: siteA,
      now,
    })
    expect(data.visibleWidgets).toEqual(['quickMenu'])
    expect(data.metricCards).toEqual([])
    expect(data.recent).toBeNull()
    expect(data.traffic).toBeNull()
    expect(data.errorSummary).toBeNull()
  })

  it('tenant scoping: the SAME super-admin on site B sees site-B data, not site-A', async () => {
    const data = await loadDashboardData({
      payload,
      req: reqFor(superUser),
      tenantId: siteB,
      now,
    })
    expect(data.today).toEqual({ visitors: 300, pageViews: 500 })
    expect(data.recent!.map((p) => p.title)).toContain('B-Only-Post')
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('A-Alpha')
    expect(serialized).not.toContain('A-Charlie-Question')
    expect(serialized).not.toContain('A Pinned Notice')
  })

  // Task 6D phase-6 fix: §3 security-doc posts must be EXCLUDED from the
  // content-admin dashboard (widgets + counts) — the dashboard is gated on
  // content.posts, not the privacy grant. Fail-without-fix.
  it('excludes §3 security-doc posts from the dashboard widgets + post counts (content.posts admin)', async () => {
    const site = await makeSite(`dsd${rand().slice(0, 4)}`)
    const ordBoard = await makeBoard(site, 'SD Ordinary', 'PG0001')
    const secBoard = await payload.create({
      collection: 'boards',
      data: {
        tenant: site,
        name: 'SD Security',
        boardType: await boardTypeIdByCode('PG0006'),
        securityDoc: true,
      } as never,
      overrideAccess: true,
    })
    await makePost(site, ordBoard, { title: 'SD-Ordinary-Post', viewCount: 3 })
    const secPost = await payload.create({
      collection: 'posts',
      data: { board: secBoard.id, title: 'SD-Security-Post' } as never,
      overrideAccess: true,
    })
    // A high view count would top Most-Viewed if it were not excluded.
    await payload.update({
      collection: 'posts',
      id: secPost.id,
      data: { viewCount: 999 } as never,
      overrideAccess: true,
      context: { skipPostSideEffects: true },
    })

    const admin = await makeLimitedAdmin(['content.posts'], [site])
    const data = await loadDashboardData({ payload, req: reqFor(admin), tenantId: site, now })

    const recentTitles = data.recent!.map((p) => p.title)
    expect(recentTitles).toContain('SD-Ordinary-Post')
    expect(recentTitles).not.toContain('SD-Security-Post')
    expect(data.mostViewed!.map((p) => p.title)).not.toContain('SD-Security-Post')
    // Counts exclude the §3 post (would be 2 each without the fix).
    expect(data.metricCards.find((c) => c.key === 'postsTotal')!.value).toBe(1)
    expect(data.metricCards.find((c) => c.key === 'postsToday')!.value).toBe(1)
    // Nothing about the §3 post leaks anywhere in the payload.
    expect(JSON.stringify(data)).not.toContain('SD-Security-Post')

    // A super-admin dashboard is unaffected — the ordinary post still shows.
    const superData = await loadDashboardData({
      payload,
      req: reqFor(superUser),
      tenantId: site,
      now,
    })
    expect(superData.recent!.map((p) => p.title)).toContain('SD-Ordinary-Post')
  })
})
