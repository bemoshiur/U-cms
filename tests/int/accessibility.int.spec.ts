import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'
import { sitesStep } from '@/seed/steps/sites'
import { accessibilityScanStep } from '@/seed/steps/accessibility'
import { ACCESSIBILITY_MENU_KEY } from '@/accessibility/constants'
import {
  handleReport,
  handleResultsList,
  handleResultsListExport,
  handleStatistics,
} from '@/endpoints/accessibilityStatsExport'
import { handleAccessibilityValidation, resetValidationDedup } from '@/site/accessibilityValidation'

let payload: Payload
let demoId: number | string
let granted: Record<string, unknown>
let roleless: Record<string, unknown>

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 10000)}`
}
const TEST_PASSWORD = 'a-long-enough-test-password-1'

async function menuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id as number
}

/** A non-super user holding `statistics.accessibility` AND assigned to the demo site. */
async function makeGrantedOnSite(): Promise<Record<string, unknown>> {
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: `ROLE_TEST_${unique('A').toUpperCase()}`,
      name: 'a11y-grant',
      description: 'x',
      menuGrants: [await menuId(ACCESSIBILITY_MENU_KEY)],
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: `${unique('a11y')}@example.com`,
      password: TEST_PASSWORD,
      roles: [role.id],
      tenants: [{ tenant: demoId }],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function makeRoleless(): Promise<Record<string, unknown>> {
  return payload.create({
    collection: 'users',
    data: {
      email: `${unique('none')}@example.com`,
      password: TEST_PASSWORD,
      roles: [],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function countDemoResults(): Promise<number> {
  const res = await payload.find({
    collection: 'accessibilityScanResults',
    where: { tenant: { equals: demoId } },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  return res.totalDocs
}

describe('Task 8.2 — web-accessibility auto-diagnosis + validation-mode toggle', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [
      adminMenusStep,
      rolesStep,
      superAdminStep,
      sitesStep,
      accessibilityScanStep,
    ])
    const demo = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    demoId = demo.docs[0]!.id
    granted = await makeGrantedOnSite()
    roleless = await makeRoleless()
  })

  // ── Menu-gated access ────────────────────────────────────────────────────
  it('a roleless admin cannot read the collection; a granted+assigned admin can', async () => {
    await expect(
      payload.find({
        collection: 'accessibilityScanResults',
        user: roleless,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    const ok = await payload.find({
      collection: 'accessibilityScanResults',
      user: granted,
      overrideAccess: false,
    })
    expect(ok.docs.length).toBeGreaterThan(0)
  })

  it('the results endpoint is 403 for a roleless caller, 200 (non-empty) for a granted one', async () => {
    const denied = await handleResultsList({
      payload,
      req: { user: roleless, payload } as unknown as PayloadRequest,
      searchParams: new URLSearchParams(`site=${demoId}`),
    })
    expect(denied.status).toBe(403)

    const allowed = await handleResultsList({
      payload,
      req: { user: granted, payload } as unknown as PayloadRequest,
      searchParams: new URLSearchParams(`site=${demoId}`),
    })
    expect(allowed.status).toBe(200)
    const body = (await allowed.json()) as {
      ok: boolean
      rows: unknown[]
      summary: { inspectedScreens: number }
    }
    expect(body.ok).toBe(true)
    expect(body.rows.length).toBeGreaterThan(0)
    expect(body.summary.inspectedScreens).toBeGreaterThan(0)
  })

  // ── Validation-mode toggle drives the DB-store behavior (TODO 8.3) ─────────
  describe('handleAccessibilityValidation — off=no-op, db/both=a row written', () => {
    const axeCriticalSerious = {
      violations: [
        {
          id: 'image-alt',
          impact: 'critical',
          help: 'alt',
          helpUrl: 'u',
          nodes: [{ html: '<img>' }],
        },
        {
          id: 'link-name',
          impact: 'serious',
          help: 'link',
          helpUrl: 'u',
          nodes: [{ html: '<a>' }],
        },
      ],
      passes: new Array(3).fill(0),
      incomplete: [],
    }

    it('off → nothing stored', async () => {
      resetValidationDedup()
      const before = await countDemoResults()
      const out = await handleAccessibilityValidation(payload, {
        mode: 'off',
        tenantId: demoId,
        route: '/mode-off',
        screenName: 'off',
        axe: axeCriticalSerious,
      })
      expect(out.stored).toBe(false)
      expect(await countDemoResults()).toBe(before)
    })

    it('popup → nothing stored (popup is client-only)', async () => {
      resetValidationDedup()
      const before = await countDemoResults()
      const out = await handleAccessibilityValidation(payload, {
        mode: 'popup',
        tenantId: demoId,
        route: '/mode-popup',
        screenName: 'popup',
        axe: axeCriticalSerious,
      })
      expect(out.stored).toBe(false)
      expect(await countDemoResults()).toBe(before)
    })

    it('db → a row is written with SERVER-derived counts (source=db)', async () => {
      resetValidationDedup()
      const before = await countDemoResults()
      const out = await handleAccessibilityValidation(payload, {
        mode: 'db',
        tenantId: demoId,
        route: '/mode-db',
        screenName: 'db',
        axe: axeCriticalSerious,
      })
      expect(out.stored).toBe(true)
      expect(await countDemoResults()).toBe(before + 1)

      const row = await payload.findByID({
        collection: 'accessibilityScanResults',
        id: out.id!,
        overrideAccess: true,
      })
      expect((row as { source?: string }).source).toBe('db')
      expect((row as { criticalCount?: number }).criticalCount).toBe(1)
      expect((row as { dangerCount?: number }).dangerCount).toBe(1)
      expect((row as { errorCount?: number }).errorCount).toBe(2)
    })

    it('popup_db → a row is written', async () => {
      resetValidationDedup()
      const before = await countDemoResults()
      const out = await handleAccessibilityValidation(payload, {
        mode: 'popup_db',
        tenantId: demoId,
        route: '/mode-both',
        screenName: 'both',
        axe: axeCriticalSerious,
      })
      expect(out.stored).toBe(true)
      expect(await countDemoResults()).toBe(before + 1)
    })

    it('dedups repeated posts for the same (session, route)', async () => {
      resetValidationDedup()
      const first = await handleAccessibilityValidation(payload, {
        mode: 'db',
        tenantId: demoId,
        route: '/mode-dedup',
        screenName: 'dedup',
        axe: axeCriticalSerious,
        clientIp: '203.0.113.9',
        userAgent: 'UA',
      })
      const second = await handleAccessibilityValidation(payload, {
        mode: 'db',
        tenantId: demoId,
        route: '/mode-dedup',
        screenName: 'dedup',
        axe: axeCriticalSerious,
        clientIp: '203.0.113.9',
        userAgent: 'UA',
      })
      expect(first.stored).toBe(true)
      expect(second.stored).toBe(false)
      expect(second.reason).toBe('deduped')
    })
  })

  // ── Statistics + itemized report ───────────────────────────────────────────
  it('statistics + report endpoints return non-empty aggregates for the seeded site', async () => {
    const statsResp = await handleStatistics({
      payload,
      req: { user: granted, payload } as unknown as PayloadRequest,
      searchParams: new URLSearchParams(`site=${demoId}`),
    })
    const stats = (await statsResp.json()) as { ok: boolean; stats: { rows: unknown[] } }
    expect(stats.ok).toBe(true)
    expect(stats.stats.rows.length).toBeGreaterThan(0)

    const reportResp = await handleReport({
      payload,
      req: { user: granted, payload } as unknown as PayloadRequest,
      searchParams: new URLSearchParams(`site=${demoId}`),
    })
    const report = (await reportResp.json()) as {
      ok: boolean
      report: { rows: unknown[]; overallCompliance: number }
    }
    expect(report.ok).toBe(true)
    expect(report.report.rows.length).toBeGreaterThan(0)
  })

  // ── CSV injection guard ─────────────────────────────────────────────────────
  it('neutralizes a formula-injection screen name in the results CSV', async () => {
    await payload.create({
      collection: 'accessibilityScanResults',
      data: {
        tenant: demoId,
        screenName: '=SUM(99)',
        route: '/inject',
        source: 'scan',
        inspectedAt: new Date().toISOString(),
        totalItems: 1,
        successCount: 0,
        errorCount: 0,
        criticalCount: 0,
        dangerCount: 0,
        warningCount: 0,
        violations: [],
      } as never,
      overrideAccess: true,
    })
    const resp = await handleResultsListExport({
      payload,
      req: { user: granted, payload } as unknown as PayloadRequest,
      searchParams: new URLSearchParams(`site=${demoId}&keyword=/inject`),
    })
    const csv = await resp.text()
    expect(csv).toContain('"\'=SUM(99)"')
    expect(csv).not.toContain(',=SUM(99),')
  })

  // ── Seed idempotency ────────────────────────────────────────────────────────
  it('the demo seed is idempotent (re-running adds no rows)', async () => {
    const before = await countDemoResults()
    await accessibilityScanStep.run(payload)
    expect(await countDemoResults()).toBe(before)
  })
})
