import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import type { CurrentMember } from '@/site/member'
import {
  loadSatisfactionSummary,
  submitSatisfactionRating,
  SatisfactionError,
} from '@/site/satisfaction'

/**
 * Task 4E — satisfaction ratings (refs 2-18/2-19). Covers: the site toggle gate,
 * score validation, server-forced fields (anon member null, cross-site menu
 * dropped), best-effort dedup (member + hashed IP), the summary average, the
 * unreadable `ipHash` (no PII leaves the server), and tenant read scoping.
 */

let payload: Payload

const TEST_PASSWORD = 'a-long-enough-test-password-1'

function uniqueSiteId(label: string): string {
  return `s${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
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

async function makeSite(
  satisfactionEnabled = true,
): Promise<{ id: number; siteId: string; satisfactionEnabled: boolean }> {
  const site = await payload.create({
    collection: 'sites',
    data: {
      siteId: uniqueSiteId('sat'),
      name: 'Satisfaction Site',
      url: 'https://sat.example.com',
      isAdminSite: false,
      satisfactionEnabled,
    },
    overrideAccess: true,
  })
  return { id: site.id, siteId: site.siteId, satisfactionEnabled }
}

async function makeMember(tenantId: number): Promise<CurrentMember> {
  const login = `m${lettersOnly()}`.slice(0, 14)
  const m = await payload.create({
    collection: 'members',
    data: {
      loginId: login,
      email: `${login}@example.com`,
      name: 'Rater',
      password: 'Member-Pass-99',
      status: 'active',
      tenant: tenantId,
    } as never,
    overrideAccess: true,
  })
  return { id: m.id, name: 'Rater', loginId: login, tenant: tenantId }
}

describe('satisfactionRatings: submit + dedup + privacy + scoping (Task 4E)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])
  })

  it('rejects a submit when the site toggle is OFF', async () => {
    const site = await makeSite(false)
    await expect(
      submitSatisfactionRating(
        payload,
        { id: site.id, satisfactionEnabled: false },
        { pageKey: '/page/1', score: 5 },
        { member: null },
      ),
    ).rejects.toBeInstanceOf(SatisfactionError)
  })

  it('rejects an out-of-range score', async () => {
    const site = await makeSite(true)
    for (const bad of [0, 6, 3.5]) {
      await expect(
        submitSatisfactionRating(
          payload,
          { id: site.id, satisfactionEnabled: true },
          { pageKey: '/page/1', score: bad },
          { member: null },
        ),
      ).rejects.toBeInstanceOf(SatisfactionError)
    }
  })

  it('records an anonymous rating (member null) and averages via the summary', async () => {
    const site = await makeSite(true)
    await submitSatisfactionRating(
      payload,
      site,
      { pageKey: '/page/9', score: 5 },
      { member: null, clientIp: '203.0.113.1' },
    )
    await submitSatisfactionRating(
      payload,
      site,
      { pageKey: '/page/9', score: 3 },
      { member: null, clientIp: '203.0.113.2' },
    )
    const summary = await loadSatisfactionSummary(payload, site.id, '/page/9')
    expect(summary.count).toBe(2)
    expect(summary.average).toBe(4)
    expect(summary.percent).toBe(80)
  })

  it('best-effort dedup: same member / same trusted IP cannot rate a page twice', async () => {
    const site = await makeSite(true)
    const member = await makeMember(site.id)
    await submitSatisfactionRating(payload, site, { pageKey: '/page/5', score: 4 }, { member })
    await expect(
      submitSatisfactionRating(payload, site, { pageKey: '/page/5', score: 2 }, { member }),
    ).rejects.toBeInstanceOf(SatisfactionError)

    // Anonymous same-IP dedup.
    await submitSatisfactionRating(
      payload,
      site,
      { pageKey: '/page/6', score: 5 },
      { member: null, clientIp: '198.51.100.7' },
    )
    await expect(
      submitSatisfactionRating(
        payload,
        site,
        { pageKey: '/page/6', score: 1 },
        { member: null, clientIp: '198.51.100.7' },
      ),
    ).rejects.toBeInstanceOf(SatisfactionError)
  })

  it('drops a cross-site menu and stores no member for an anonymous rating', async () => {
    const siteA = await makeSite(true)
    const siteB = await makeSite(true)
    // A menu that belongs to site B — must NOT be attached to a site-A rating.
    const foreignMenu = await payload.create({
      collection: 'menus',
      data: { tenant: siteB.id, name: 'B menu', contentType: 'placeholder' },
      overrideAccess: true,
    })
    const { id } = await submitSatisfactionRating(
      payload,
      siteA,
      { pageKey: '/page/2', menuId: foreignMenu.id, score: 4 },
      { member: null },
    )
    const row = await payload.findByID({
      collection: 'satisfactionRatings',
      id,
      overrideAccess: true,
    })
    expect(row.menu).toBeFalsy() // foreign menu dropped
    expect(row.member).toBeFalsy() // anonymous
    expect(String(toRelationId(row.tenant))).toBe(String(siteA.id))
  })

  it('ipHash is never readable (no dedup token leaves the server) but tenant read is scoped', async () => {
    const site = await makeSite(true)
    const { id } = await submitSatisfactionRating(
      payload,
      site,
      { pageKey: '/page/3', score: 5 },
      { member: null, clientIp: '192.0.2.44' },
    )

    // overrideAccess read sees ipHash (used for dedup)...
    const asSystem = await payload.findByID({
      collection: 'satisfactionRatings',
      id,
      overrideAccess: true,
    })
    expect(typeof (asSystem as { ipHash?: unknown }).ipHash).toBe('string')

    // ...but a scoped admin read never returns it (read:false), and never leaks the raw IP.
    const grant = await adminMenuId('statistics.satisfaction')
    const role = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_SAT_${lettersOnly().toUpperCase()}`,
        name: 'sat',
        description: 'stats grant',
        menuGrants: [grant],
      },
      overrideAccess: true,
    })
    const scoped = await payload.create({
      collection: 'users',
      data: {
        email: `sat-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`,
        password: TEST_PASSWORD,
        roles: [role.id],
        tenants: [{ tenant: site.id }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    const asAdmin = await payload.findByID({
      collection: 'satisfactionRatings',
      id,
      overrideAccess: false,
      user: scoped,
    })
    expect((asAdmin as { ipHash?: unknown }).ipHash).toBeUndefined()
    const serialized = JSON.stringify(asAdmin)
    expect(serialized).not.toContain('192.0.2.44')

    // Tenant scoping: the scoped admin cannot read another site's ratings.
    const other = await makeSite(true)
    await submitSatisfactionRating(
      payload,
      other,
      { pageKey: '/page/1', score: 3 },
      { member: null, clientIp: '192.0.2.99' },
    )
    const visible = await payload.find({
      collection: 'satisfactionRatings',
      overrideAccess: false,
      user: scoped,
      limit: 0,
      pagination: false,
    })
    for (const d of visible.docs) {
      expect(String(toRelationId(d.tenant))).toBe(String(site.id))
    }
  })
})
