import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { recordPageView } from '@/site/traffic'

/**
 * Task 4E — public traffic capture (TODO 4.9). Covers the Phase-6 privacy
 * guarantee (NO raw IP / PII stored), device-class derivation, referrer-host
 * reduction, /page/{n} menu resolution, the unreadable `sessionKey`, and tenant
 * read scoping. This is the DATA MODEL + capture; aggregation is Phase 5.
 */

let payload: Payload

const TEST_PASSWORD = 'a-long-enough-test-password-1'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605'

function uniqueSiteId(label: string): string {
  return `p${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
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
      siteId: uniqueSiteId('pv'),
      name: 'PageViews Site',
      url: 'https://pv.example.com',
      isAdminSite: false,
    },
    overrideAccess: true,
  })
  return site.id
}

describe('pageViews: privacy-conscious traffic capture (Task 4E)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])
  })

  it('stores NO raw IP / PII: keeps a hashed session key, coarse device, and referrer HOST only', async () => {
    const siteId = await makeSite()
    const rawIp = '203.0.113.77'
    const id = await recordPageView(payload, {
      tenantId: siteId,
      path: '/board/B1?token=secret123#frag',
      userAgent: IPHONE_UA,
      referrer: 'https://search.example.com/results?q=private+query',
      clientIp: rawIp,
    })
    expect(id).not.toBeNull()

    const row = await payload.findByID({
      collection: 'pageViews',
      id: id as number,
      overrideAccess: true,
    })
    // Path is query/fragment-stripped.
    expect(row.path).toBe('/board/B1')
    // Coarse device class.
    expect(row.deviceType).toBe('mobile')
    // Referrer reduced to the HOST — no path/query.
    expect(row.referrerHost).toBe('search.example.com')
    // A session hash exists but is NOT the raw IP.
    expect(typeof (row as { sessionKey?: unknown }).sessionKey).toBe('string')
    expect((row as { sessionKey?: string }).sessionKey).not.toBe(rawIp)
    // The raw IP + referrer query must appear NOWHERE in the stored row.
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain(rawIp)
    expect(serialized).not.toContain('private+query')
    expect(serialized).not.toContain('secret123')
  })

  it('B2 — a reset-password token in the path is NEVER stored verbatim (collapsed to a tokenless label)', async () => {
    const siteId = await makeSite()
    // Real crypto.randomBytes(20)-hex shape + a couple of token-shaped values.
    const tokens = [
      'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
      'deadBEEF0123456789cafef00d',
      'tok-en_with.oddchars',
    ]
    for (const token of tokens) {
      const id = await recordPageView(payload, {
        tenantId: siteId,
        path: `/reset-password/${token}`,
        userAgent: MAC_UA,
        referrer: null,
        clientIp: '198.51.100.5',
      })
      expect(id).not.toBeNull()
      const row = await payload.findByID({
        collection: 'pageViews',
        id: id as number,
        overrideAccess: true,
      })
      // Collapsed to the stable, tokenless label...
      expect(row.path).toBe('/reset-password/[token]')
      // ...and the single-use account-takeover token appears NOWHERE in the row
      // (fail-without-fix: the raw path would land verbatim in this exportable log).
      expect(JSON.stringify(row)).not.toContain(token)
    }
  })

  it('derives desktop for a desktop UA and resolves the owning menu for /page/{n}', async () => {
    const siteId = await makeSite()
    const menu = await payload.create({
      collection: 'menus',
      data: { tenant: siteId, name: 'Intro', contentType: 'content' },
      overrideAccess: true,
    })
    const menuNumber = (menu as { menuNumber?: number }).menuNumber as number
    expect(typeof menuNumber).toBe('number')

    const id = await recordPageView(payload, {
      tenantId: siteId,
      path: `/page/${menuNumber}`,
      userAgent: MAC_UA,
      referrer: null,
      clientIp: null,
    })
    const row = await payload.findByID({
      collection: 'pageViews',
      id: id as number,
      overrideAccess: true,
    })
    expect(row.deviceType).toBe('desktop')
    expect(String(toRelationId(row.menu))).toBe(String(menu.id))
    expect(row.referrerHost).toBeFalsy()
  })

  it('sessionKey is never readable and reads are tenant-scoped', async () => {
    const siteId = await makeSite()
    await recordPageView(payload, {
      tenantId: siteId,
      path: '/',
      userAgent: MAC_UA,
      clientIp: '198.51.100.9',
    })

    const grant = await adminMenuId('statistics.traffic')
    const role = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_PV_${lettersOnly().toUpperCase()}`,
        name: 'pv',
        description: 'traffic grant',
        menuGrants: [grant],
      },
      overrideAccess: true,
    })
    const scoped = await payload.create({
      collection: 'users',
      data: {
        email: `pv-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`,
        password: TEST_PASSWORD,
        roles: [role.id],
        tenants: [{ tenant: siteId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })

    const visible = await payload.find({
      collection: 'pageViews',
      overrideAccess: false,
      user: scoped,
      limit: 0,
      pagination: false,
    })
    expect(visible.docs.length).toBeGreaterThan(0)
    for (const d of visible.docs) {
      expect(String(toRelationId(d.tenant))).toBe(String(siteId))
      // read:false — the session hash never leaves the server.
      expect((d as { sessionKey?: unknown }).sessionKey).toBeUndefined()
    }

    // A different site's views are invisible to this scoped admin.
    const otherSite = await makeSite()
    await recordPageView(payload, {
      tenantId: otherSite,
      path: '/',
      userAgent: MAC_UA,
      clientIp: '198.51.100.10',
    })
    const stillScoped = await payload.find({
      collection: 'pageViews',
      overrideAccess: false,
      user: scoped,
      limit: 0,
      pagination: false,
    })
    for (const d of stillScoped.docs) {
      expect(String(toRelationId(d.tenant))).toBe(String(siteId))
    }
  })
})
