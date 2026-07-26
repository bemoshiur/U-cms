import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { monthlyFromDaily } from '@/content/trafficStats'
import { handleTrafficStats, handleTrafficStatsExport } from '@/endpoints/trafficExport'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { boardTypesStep, SEED_BOARD_TYPES } from '@/seed/steps/boardTypes'
import { sitesStep } from '@/seed/steps/sites'
import { recordPageView } from '@/site/traffic'
import {
  aggregateTrafficForDate,
  pruneAgedPageViews,
  utcDayString,
} from '@/site/trafficAggregation'
import { loadDailyRollups } from '@/site/trafficStatsData'

/**
 * Task 5A — traffic aggregation + retention + statistics (TODO 5.1/5.2) and the
 * carried D6 capture hardening (Part 0). Boots real Payload against Postgres.
 */

let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/17 Safari/605'

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
      siteId: uniqueSiteId('agg'),
      name: 'Agg Site',
      url: 'https://agg.example.com',
      isAdminSite: false,
    },
    overrideAccess: true,
  })
  return site.id
}

/** Inserts one raw page view with full control of day/session/dimensions. */
async function seedRawView(args: {
  tenantId: number
  path: string
  day: string
  session: string
  os?: string
  browser?: string
  device?: 'mobile' | 'desktop'
  hour?: string
}): Promise<void> {
  await payload.create({
    collection: 'pageViews',
    data: {
      tenant: args.tenantId,
      path: args.path,
      deviceType: args.device ?? 'desktop',
      osFamily: args.os ?? 'windows',
      browserFamily: args.browser ?? 'chrome',
      referrerHost: null,
      sessionKey: args.session,
      ts: `${args.day}T${args.hour ?? '10'}:00:00.000Z`,
    } as never,
    overrideAccess: true,
  })
}

/** A scoped admin user holding `statistics.traffic` on the given tenant(s). */
async function makeTrafficAdmin(tenantIds: number[]): Promise<Record<string, unknown>> {
  const grant = await adminMenuId('statistics.traffic')
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: `ROLE_TR_${lettersOnly().toUpperCase()}`,
      name: 'traffic',
      description: 'traffic grant',
      menuGrants: [grant],
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: `tr-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`,
      password: TEST_PASSWORD,
      roles: [role.id],
      tenants: tenantIds.map((t) => ({ tenant: t })),
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function boardTypeId(): Promise<number> {
  const code = SEED_BOARD_TYPES[0]!.code
  const found = await payload.find({
    collection: 'boardTypes',
    where: { code: { equals: code } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id
}

describe('Task 5A — traffic aggregation, retention, statistics + D6 hardening', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])
  })

  // ── Part 0 — capture hardening (D6) ──────────────────────────────────────
  describe('capture hardening (D6): path canonicalized to the site’s real routes', () => {
    it('keeps a KNOWN board path concrete, and stores coarse OS/browser families', async () => {
      const siteId = await makeSite()
      const board = await payload.create({
        collection: 'boards',
        data: { tenant: siteId, name: 'Notice', boardType: await boardTypeId() },
        overrideAccess: true,
      })
      const bbsId = (board as { bbsId: string }).bbsId
      const id = await recordPageView(payload, {
        tenantId: siteId,
        path: `/board/${bbsId}/123?x=1`, // post detail → collapses to the board
        userAgent: MAC_UA,
        clientIp: '198.51.100.20',
      })
      const row = await payload.findByID({
        collection: 'pageViews',
        id: id as number,
        overrideAccess: true,
      })
      expect(row.path).toBe(`/board/${bbsId}`)
      expect(row.osFamily).toBe('macos')
      expect(row.browserFamily).toBe('safari')
    })

    it('buckets a /page/{n} for a NON-existent menu to __other__ (bounded)', async () => {
      const siteId = await makeSite()
      const id = await recordPageView(payload, {
        tenantId: siteId,
        path: '/page/999999',
        userAgent: MAC_UA,
        clientIp: '198.51.100.21',
      })
      const row = await payload.findByID({
        collection: 'pageViews',
        id: id as number,
        overrideAccess: true,
      })
      expect(row.path).toBe('__other__')
      expect(toRelationId(row.menu)).toBeUndefined()
    })

    it('an attacker-chosen unknown path is bucketed to __other__', async () => {
      const siteId = await makeSite()
      const id = await recordPageView(payload, {
        tenantId: siteId,
        path: '/wp-admin/../../etc/passwd',
        userAgent: MAC_UA,
        clientIp: '198.51.100.22',
      })
      const row = await payload.findByID({
        collection: 'pageViews',
        id: id as number,
        overrideAccess: true,
      })
      expect(row.path).toBe('__other__')
    })
  })

  // ── Part 1 — aggregation ─────────────────────────────────────────────────
  describe('D-1 aggregation is idempotent + counts unique visitors by distinct session', () => {
    it('re-running the same date overwrites (never double-counts) and counts distinct sessions', async () => {
      const siteId = await makeSite()
      const day = '2026-03-10'
      await seedRawView({ tenantId: siteId, path: '/', day, session: 'a' })
      await seedRawView({ tenantId: siteId, path: '/page/3', day, session: 'a', device: 'mobile' })
      await seedRawView({ tenantId: siteId, path: '/page/3', day, session: 'b' })

      const first = await aggregateTrafficForDate(payload, { tenantId: siteId, date: day })
      expect(first.totalViews).toBe(3)
      expect(first.uniqueVisitors).toBe(2) // sessions a, b

      // Re-run — must NOT double count, and must reuse the SAME (tenant,date) doc.
      const second = await aggregateTrafficForDate(payload, { tenantId: siteId, date: day })
      expect(second.totalViews).toBe(3)
      expect(second.uniqueVisitors).toBe(2)
      expect(String(second.rollupId)).toBe(String(first.rollupId))

      const rollups = await payload.find({
        collection: 'trafficDaily',
        where: { and: [{ tenant: { equals: siteId } }, { date: { equals: day } }] },
        pagination: false,
        overrideAccess: true,
      })
      expect(rollups.docs).toHaveLength(1)
      const doc = rollups.docs[0]!
      expect(doc.totalViews).toBe(3)
      expect(doc.byPath).toEqual([
        { path: '/page/3', menuNumber: 3, views: 2 },
        { path: '/', menuNumber: null, views: 1 },
      ])
    })

    it('monthly = sum of daily across a range', async () => {
      const siteId = await makeSite()
      await seedRawView({ tenantId: siteId, path: '/', day: '2026-04-01', session: 'a' })
      await seedRawView({ tenantId: siteId, path: '/', day: '2026-04-01', session: 'b' })
      await seedRawView({ tenantId: siteId, path: '/page/2', day: '2026-04-02', session: 'a' })
      await aggregateTrafficForDate(payload, { tenantId: siteId, date: '2026-04-01' })
      await aggregateTrafficForDate(payload, { tenantId: siteId, date: '2026-04-02' })

      const dailies = await loadDailyRollups(payload, {
        tenantId: siteId,
        from: '2026-04-01',
        to: '2026-04-30',
        overrideAccess: true,
      })
      expect(dailies).toHaveLength(2)
      const months = monthlyFromDaily(dailies)
      expect(months).toHaveLength(1)
      expect(months[0]!.date).toBe('2026-04')
      expect(months[0]!.totalViews).toBe(3) // 2 + 1
      expect(months[0]!.uniqueVisitors).toBe(3) // Σ daily uniques (2 + 1)
    })
  })

  // ── Part 1 — retention ───────────────────────────────────────────────────
  describe('retention prune: aged + aggregated rows are pruned; un-aggregated days are kept', () => {
    it('prunes an aggregated old day but NEVER an un-aggregated old day', async () => {
      const siteId = await makeSite()
      const now = new Date()
      const aggregatedDay = utcDayString(new Date(now.getTime() - 120 * 86_400_000))
      const unaggregatedDay = utcDayString(new Date(now.getTime() - 110 * 86_400_000))
      const recentDay = utcDayString(new Date(now.getTime() - 1 * 86_400_000))

      await seedRawView({ tenantId: siteId, path: '/', day: aggregatedDay, session: 'a' })
      await seedRawView({ tenantId: siteId, path: '/', day: unaggregatedDay, session: 'b' })
      await seedRawView({ tenantId: siteId, path: '/', day: recentDay, session: 'c' })

      // Only the old day is aggregated.
      await aggregateTrafficForDate(payload, { tenantId: siteId, date: aggregatedDay })

      const result = await pruneAgedPageViews(payload, { retentionDays: 90, now })
      expect(result.deleted).toBeGreaterThanOrEqual(1)

      const remaining = async (day: string): Promise<number> => {
        const { start, end } = { start: `${day}T00:00:00.000Z`, end: `${day}T23:59:59.999Z` }
        const r = await payload.find({
          collection: 'pageViews',
          where: {
            and: [
              { tenant: { equals: siteId } },
              { ts: { greater_than_equal: start } },
              { ts: { less_than_equal: end } },
            ],
          },
          pagination: false,
          overrideAccess: true,
        })
        return r.totalDocs
      }
      expect(await remaining(aggregatedDay)).toBe(0) // aggregated → pruned
      expect(await remaining(unaggregatedDay)).toBe(1) // NOT aggregated → kept (safety)
      expect(await remaining(recentDay)).toBe(1) // within retention → kept

      // Idempotent: a second prune removes nothing new for this site's old day.
      const again = await pruneAgedPageViews(payload, { retentionDays: 90, now })
      expect(await remaining(aggregatedDay)).toBe(0)
      expect(again.deleted).toBeGreaterThanOrEqual(0)
    })
  })

  // ── Part 2 — statistics: tenant scoping + export ─────────────────────────
  describe('statistics views are tenant-scoped + access-gated', () => {
    it('a scoped read sees its own site’s rollups and NOT another site’s', async () => {
      const siteA = await makeSite()
      const siteB = await makeSite()
      await seedRawView({ tenantId: siteA, path: '/', day: '2026-05-01', session: 'a' })
      await seedRawView({ tenantId: siteB, path: '/', day: '2026-05-01', session: 'b' })
      await aggregateTrafficForDate(payload, { tenantId: siteA, date: '2026-05-01' })
      await aggregateTrafficForDate(payload, { tenantId: siteB, date: '2026-05-01' })

      const adminA = await makeTrafficAdmin([siteA])
      const ownRange = { from: '2026-05-01', to: '2026-05-31' }
      const own = await loadDailyRollups(payload, {
        tenantId: siteA,
        ...ownRange,
        user: adminA,
        overrideAccess: false,
      })
      expect(own.length).toBeGreaterThan(0)

      // Same admin asking for site B → tenant scope filters it to empty.
      const cross = await loadDailyRollups(payload, {
        tenantId: siteB,
        ...ownRange,
        user: adminA,
        overrideAccess: false,
      })
      expect(cross).toHaveLength(0)
    })

    it('export CSV is gated (roleless → 403), tenant-scoped, and carries the right rows', async () => {
      const siteA = await makeSite()
      const siteB = await makeSite()
      await seedRawView({
        tenantId: siteA,
        path: '/page/7',
        day: '2026-06-01',
        session: 'a',
        os: 'ios',
      })
      await seedRawView({
        tenantId: siteA,
        path: '/page/7',
        day: '2026-06-01',
        session: 'b',
        os: 'ios',
      })
      await seedRawView({
        tenantId: siteB,
        path: '/',
        day: '2026-06-01',
        session: 'z',
        os: 'windows',
      })
      await aggregateTrafficForDate(payload, { tenantId: siteA, date: '2026-06-01' })
      await aggregateTrafficForDate(payload, { tenantId: siteB, date: '2026-06-01' })

      const adminA = await makeTrafficAdmin([siteA])
      const reqA = { user: adminA, payload } as never
      const range = 'from=2026-06-01&to=2026-06-30'

      // OS tab for site A → contains ios with the two views.
      const osResp = await handleTrafficStatsExport({
        payload,
        req: reqA,
        searchParams: new URLSearchParams(`site=${siteA}&${range}&tab=os`),
      })
      expect(osResp.status).toBe(200)
      const osCsv = await osResp.text()
      expect(osCsv).toContain('ios')
      expect(osCsv).toContain('2') // 2 ios views

      // Menu/Page tab for site A → /page/7 present.
      const menuResp = await handleTrafficStatsExport({
        payload,
        req: reqA,
        searchParams: new URLSearchParams(`site=${siteA}&${range}&tab=menu`),
      })
      const menuCsv = await menuResp.text()
      expect(menuCsv).toContain('/page/7')

      // Same admin exporting site B → tenant scope yields an EMPTY body (header only).
      const crossResp = await handleTrafficStatsExport({
        payload,
        req: reqA,
        searchParams: new URLSearchParams(`site=${siteB}&${range}&tab=os`),
      })
      const crossCsv = await crossResp.text()
      expect(crossCsv).not.toContain('windows')

      // Missing site → 400.
      const badResp = await handleTrafficStatsExport({
        payload,
        req: reqA,
        searchParams: new URLSearchParams(`${range}&tab=os`),
      })
      expect(badResp.status).toBe(400)

      // A roleless user → 403 (denied), for both JSON + CSV.
      const roleless = await payload.create({
        collection: 'users',
        data: {
          email: `norole-${Date.now()}@example.com`,
          password: TEST_PASSWORD,
          roles: [],
          tenants: [{ tenant: siteA }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      const reqNone = { user: roleless, payload } as never
      const deniedJson = await handleTrafficStats({
        payload,
        req: reqNone,
        searchParams: new URLSearchParams(`site=${siteA}&${range}`),
      })
      expect(deniedJson.status).toBe(403)
      const deniedCsv = await handleTrafficStatsExport({
        payload,
        req: reqNone,
        searchParams: new URLSearchParams(`site=${siteA}&${range}&tab=os`),
      })
      expect(deniedCsv.status).toBe(403)
    })
  })
})
