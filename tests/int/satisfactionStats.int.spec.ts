import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import {
  handleSatisfactionStats,
  handleSatisfactionStatsExport,
} from '@/endpoints/satisfactionStatsExport'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'

/**
 * Task 5B — satisfaction statistics (TODO 5.4, ref 2-19): distribution + % +
 * weighted average, the DEPARTMENT → MENU cascade, per-menu averages, tenant
 * scoping + gating + export. Boots real Payload against Postgres.
 */

let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'

function uniqueSiteId(label: string): string {
  return `t${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}
function lettersOnly(): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  let out = ''
  while (n > 0) {
    out += String.fromCharCode(97 + (n % 26))
    n = Math.floor(n / 26)
  }
  return out
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
async function makeSite(): Promise<number> {
  const site = await payload.create({
    collection: 'sites',
    data: {
      siteId: uniqueSiteId('sat'),
      name: 'Sat Site',
      url: 'https://sat.example.com',
      isAdminSite: false,
    },
    overrideAccess: true,
  })
  return site.id
}
async function makeDept(name: string): Promise<number> {
  const d = await payload.create({
    collection: 'departments',
    data: { name },
    overrideAccess: true,
  })
  return d.id
}
async function makeMenu(tenantId: number, name: string, deptId?: number): Promise<number> {
  const m = await payload.create({
    collection: 'menus',
    data: {
      tenant: tenantId,
      name,
      contentType: 'content',
      ...(deptId ? { personInCharge: { relationTo: 'departments', value: deptId } } : {}),
    } as never,
    overrideAccess: true,
  })
  return m.id
}
async function makeRating(tenantId: number, menuId: number | null, score: number): Promise<void> {
  await payload.create({
    collection: 'satisfactionRatings',
    data: {
      tenant: tenantId,
      ...(menuId ? { menu: menuId } : {}),
      pageKey: menuId ? `/page/menu-${menuId}` : '/',
      score,
      member: null,
      submittedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
  })
}
async function makeSatisfactionAdmin(tenantIds: number[]): Promise<Record<string, unknown>> {
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: `ROLE_SAT_${lettersOnly().toUpperCase()}`,
      name: 'satisfaction',
      description: 'satisfaction grant',
      menuGrants: [await adminMenuId('statistics.satisfaction')],
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: `sat-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`,
      password: TEST_PASSWORD,
      roles: [role.id],
      tenants: tenantIds.map((t) => ({ tenant: t })),
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function statsJson(
  req: never,
  qs: string,
): Promise<{
  status: number
  stats?: {
    count: number
    weightedAverage: number | null
    percent: number | null
    distribution: { score: number; count: number; percentage: number }[]
    departments: { id: string | number; name: string }[]
    menus: { id: string | number; name: string }[]
    byMenu: {
      menuId: string | number | null
      count: number
      average: number | null
      menuName: string
    }[]
  }
}> {
  const resp = await handleSatisfactionStats({
    payload,
    req,
    searchParams: new URLSearchParams(qs),
  })
  if (resp.status !== 200) {
    return { status: resp.status }
  }
  const body = (await resp.json()) as {
    stats: NonNullable<Awaited<ReturnType<typeof statsJson>>['stats']>
  }
  return { status: 200, stats: body.stats }
}

describe('Task 5B — satisfaction statistics', () => {
  let siteA: number
  let siteB: number
  let deptX: number
  let deptY: number
  let menu1: number
  let menu2: number
  let menu3: number
  let adminA: Record<string, unknown>

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [adminMenusStep, sitesStep])

    siteA = await makeSite()
    siteB = await makeSite()
    deptX = await makeDept(`Dept X ${lettersOnly()}`)
    deptY = await makeDept(`Dept Y ${lettersOnly()}`)
    menu1 = await makeMenu(siteA, 'Menu One', deptX)
    menu2 = await makeMenu(siteA, 'Menu Two', deptX)
    menu3 = await makeMenu(siteA, 'Menu Three', deptY)

    // menu1 (X): 5,5,3 ; menu2 (X): 4 ; menu3 (Y): 1,1  → site A = 6 ratings.
    for (const s of [5, 5, 3]) await makeRating(siteA, menu1, s)
    await makeRating(siteA, menu2, 4)
    for (const s of [1, 1]) await makeRating(siteA, menu3, s)
    // Site B has its own rating (must never appear for site-A admin).
    await makeRating(siteB, null, 2)

    adminA = await makeSatisfactionAdmin([siteA])
  })

  it('distribution + weighted average + satisfaction % over the whole site', async () => {
    const req = { user: adminA, payload } as never
    const { status, stats } = await statsJson(req, `site=${siteA}`)
    expect(status).toBe(200)
    expect(stats!.count).toBe(6)
    // (5+5+3+4+1+1)/6 = 3.17 → 만족도 % = 3.17 × 20 = 63.4
    expect(stats!.weightedAverage).toBe(3.17)
    expect(stats!.percent).toBe(63.4)
    const byScore = new Map(stats!.distribution.map((b) => [b.score, b]))
    expect(byScore.get(5)!.count).toBe(2)
    expect(byScore.get(4)!.count).toBe(1)
    expect(byScore.get(3)!.count).toBe(1)
    expect(byScore.get(1)!.count).toBe(2)
    // % weighting: two of six are 5s → 33.3%
    expect(byScore.get(5)!.percentage).toBe(33.3)
  })

  it('per-menu averages (bars) resolve menu names', async () => {
    const req = { user: adminA, payload } as never
    const { stats } = await statsJson(req, `site=${siteA}`)
    const byMenuId = new Map(stats!.byMenu.map((m) => [String(m.menuId), m]))
    expect(byMenuId.get(String(menu1))).toMatchObject({
      count: 3,
      average: 4.33,
      menuName: 'Menu One',
    })
    expect(byMenuId.get(String(menu3))).toMatchObject({
      count: 2,
      average: 1,
      menuName: 'Menu Three',
    })
  })

  it('DEPARTMENT → MENU cascade narrows menus + counted ratings', async () => {
    const req = { user: adminA, payload } as never

    // Department X → only menu1 + menu2 (4 ratings), avg (5+5+3+4)/4 = 4.25.
    const dx = await statsJson(req, `site=${siteA}&department=${deptX}`)
    expect(dx.stats!.count).toBe(4)
    expect(dx.stats!.weightedAverage).toBe(4.25)
    expect(dx.stats!.menus.map((m) => String(m.id)).sort()).toEqual(
      [String(menu1), String(menu2)].sort(),
    )
    // Department Y menu (menu3) is NOT among X's menu options.
    expect(dx.stats!.menus.map((m) => String(m.id))).not.toContain(String(menu3))

    // Drill to a single menu → only that menu's 3 ratings.
    const m1 = await statsJson(req, `site=${siteA}&department=${deptX}&menu=${menu1}`)
    expect(m1.stats!.count).toBe(3)
    expect(m1.stats!.weightedAverage).toBe(4.33)

    // The department options list both departments referenced by site-A menus.
    expect(dx.stats!.departments.map((d) => String(d.id)).sort()).toEqual(
      [String(deptX), String(deptY)].sort(),
    )
  })

  it('is tenant-scoped: a site-A admin querying site B sees nothing', async () => {
    const req = { user: adminA, payload } as never
    const { stats } = await statsJson(req, `site=${siteB}`)
    expect(stats!.count).toBe(0)
    expect(stats!.byMenu).toHaveLength(0)
  })

  it('is access-gated (roleless → 403) and needs a site (missing → 400)', async () => {
    const roleless = await payload.create({
      collection: 'users',
      data: {
        email: `sat-norole-${Date.now()}@example.com`,
        password: TEST_PASSWORD,
        roles: [],
        tenants: [{ tenant: siteA }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    const reqNone = { user: roleless, payload } as never
    const denied = await handleSatisfactionStats({
      payload,
      req: reqNone,
      searchParams: new URLSearchParams(`site=${siteA}`),
    })
    expect(denied.status).toBe(403)

    const reqA = { user: adminA, payload } as never
    const bad = await handleSatisfactionStats({
      payload,
      req: reqA,
      searchParams: new URLSearchParams(''),
    })
    expect(bad.status).toBe(400)
  })

  it('CSV export carries the distribution + per-menu rows, tenant-scoped', async () => {
    const reqA = { user: adminA, payload } as never
    const resp = await handleSatisfactionStatsExport({
      payload,
      req: reqA,
      searchParams: new URLSearchParams(`site=${siteA}`),
    })
    expect(resp.status).toBe(200)
    const csv = await resp.text()
    expect(csv).toContain('Weighted average')
    expect(csv).toContain('Menu One')
    expect(csv).toContain('Menu Three')
    // Total ratings 6 shows in the summary.
    expect(csv).toContain('"6"')
  })
})
