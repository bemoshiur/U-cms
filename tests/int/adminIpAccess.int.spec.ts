import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { adminIpRulesStep } from '@/seed/steps/adminIpRules'
import { isIpAllowedForAdmin } from '@/security/ipAccessGuard'
import { classifyAdminPath, evaluateAdminIpRequest } from '@/security/adminIpEnforcement'

let payload: Payload
let adminSiteId: number

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 100000)}`
}

/** A wide, always-valid window for a rule whose window shouldn't be the variable under test. */
const WINDOW = {
  validFrom: '2000-01-01T00:00:00.000Z',
  validTo: '2999-12-31T23:59:59.000Z',
}

async function makeSite(isAdminSite = false): Promise<number> {
  const siteId = unique('s')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  const site = await payload.create({
    collection: 'sites',
    data: { siteId, name: `Test ${siteId}`, url: 'http://localhost:3000', isAdminSite },
    overrideAccess: true,
  })
  return site.id as number
}

async function createRule(
  siteId: number,
  overrides: Partial<{
    ipAddress: string
    accessType: 'allow' | 'block'
    isActive: boolean
    validFrom: string
    validTo: string
  }> = {},
): Promise<number> {
  const doc = await payload.create({
    collection: 'adminIpRules',
    data: {
      applicantName: 'Tester',
      affiliation: 'QA',
      phone: '000',
      ipAddress: overrides.ipAddress ?? '203.0.113.7',
      accessType: overrides.accessType ?? 'allow',
      isActive: overrides.isActive ?? true,
      validFrom: overrides.validFrom ?? WINDOW.validFrom,
      validTo: overrides.validTo ?? WINDOW.validTo,
      siteId,
    },
    overrideAccess: true,
  })
  return doc.id as number
}

async function deleteAllAdminRules(): Promise<void> {
  await payload.delete({
    collection: 'adminIpRules',
    where: { siteId: { equals: adminSiteId } },
    overrideAccess: true,
  })
}

describe('admin IP access control (Task 2C)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])
    const found = await payload.find({
      collection: 'sites',
      where: { isAdminSite: { equals: true } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    adminSiteId = found.docs[0]!.id as number
  })

  describe('isIpAllowedForAdmin (default-deny guard)', () => {
    it('empty ruleset → ALLOWED (bootstrap safety)', async () => {
      const site = await makeSite()
      const decision = await isIpAllowedForAdmin(payload, '198.51.100.9', site)
      expect(decision.allowed).toBe(true)
      expect(decision.reason).toBe('no-rules-bootstrap')
    })

    it('matching allow rule → ALLOWED', async () => {
      const site = await makeSite()
      await createRule(site, { ipAddress: '203.0.113.7', accessType: 'allow' })
      expect((await isIpAllowedForAdmin(payload, '203.0.113.7', site)).allowed).toBe(true)
    })

    it('non-matching IP under a populated ruleset → DENIED (default-deny)', async () => {
      const site = await makeSite()
      await createRule(site, { ipAddress: '203.0.113.7', accessType: 'allow' })
      const decision = await isIpAllowedForAdmin(payload, '198.51.100.9', site)
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toBe('default-deny')
    })

    it('matching block rule wins over a matching allow rule', async () => {
      const site = await makeSite()
      await createRule(site, { ipAddress: '203.0.113.*', accessType: 'allow' })
      await createRule(site, { ipAddress: '203.0.113.7', accessType: 'block' })
      const decision = await isIpAllowedForAdmin(payload, '203.0.113.7', site)
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toBe('blocked-by-rule')
    })

    it('expired allow rule is ignored → DENIED', async () => {
      const site = await makeSite()
      await createRule(site, {
        ipAddress: '203.0.113.7',
        accessType: 'allow',
        validFrom: '2000-01-01T00:00:00.000Z',
        validTo: '2001-01-01T00:00:00.000Z',
      })
      expect((await isIpAllowedForAdmin(payload, '203.0.113.7', site)).allowed).toBe(false)
    })

    it('not-yet-valid (future) allow rule is ignored → DENIED', async () => {
      const site = await makeSite()
      await createRule(site, {
        ipAddress: '203.0.113.7',
        accessType: 'allow',
        validFrom: '2999-01-01T00:00:00.000Z',
        validTo: '2999-12-31T00:00:00.000Z',
      })
      expect((await isIpAllowedForAdmin(payload, '203.0.113.7', site)).allowed).toBe(false)
    })

    it('inactive allow rule is ignored → DENIED', async () => {
      const site = await makeSite()
      await createRule(site, { ipAddress: '203.0.113.7', accessType: 'allow', isActive: false })
      expect((await isIpAllowedForAdmin(payload, '203.0.113.7', site)).allowed).toBe(false)
    })

    it('a rule on another site does not grant access here (wrong-site ignored)', async () => {
      const siteA = await makeSite()
      const siteB = await makeSite()
      // siteA allows the IP; siteB has an unrelated rule so it is not bootstrap-open.
      await createRule(siteA, { ipAddress: '203.0.113.7', accessType: 'allow' })
      await createRule(siteB, { ipAddress: '10.0.0.1', accessType: 'allow' })
      expect((await isIpAllowedForAdmin(payload, '203.0.113.7', siteB)).allowed).toBe(false)
      // sanity: it IS allowed on siteA
      expect((await isIpAllowedForAdmin(payload, '203.0.113.7', siteA)).allowed).toBe(true)
    })

    it('an unknown client IP is covered by a * allow but not by a specific allow', async () => {
      const siteStar = await makeSite()
      await createRule(siteStar, { ipAddress: '*', accessType: 'allow' })
      expect((await isIpAllowedForAdmin(payload, undefined, siteStar)).allowed).toBe(true)

      const siteExact = await makeSite()
      await createRule(siteExact, { ipAddress: '203.0.113.7', accessType: 'allow' })
      expect((await isIpAllowedForAdmin(payload, undefined, siteExact)).allowed).toBe(false)
    })
  })

  describe('evaluateAdminIpRequest (enforcement + path scoping + denial audit)', () => {
    beforeAll(async () => {
      // Deterministic admin-site ruleset regardless of what other specs seeded.
      await deleteAllAdminRules()
      await createRule(adminSiteId, { ipAddress: '203.0.113.7', accessType: 'allow' })
    })
    afterAll(async () => {
      await deleteAllAdminRules()
    })

    it('blocks a disallowed IP on a guarded admin route (403) and writes a denied accessLog', async () => {
      const pathname = `/admin/collections/users?probe=${unique('p')}`
      const result = await evaluateAdminIpRequest({
        payload,
        pathname,
        clientIp: '198.51.100.9',
      })
      expect(result.allowed).toBe(false)
      expect(result.status).toBe(403)

      const logs = await payload.find({
        collection: 'accessLogs',
        where: { and: [{ url: { equals: pathname } }, { action: { equals: 'denied' } }] },
        overrideAccess: true,
      })
      expect(logs.docs).toHaveLength(1)
      expect(logs.docs[0]!.ipAddress).toBe('198.51.100.9')
      expect(logs.docs[0]!.menuKey).toBe('system.ipAccessControl')
    })

    it('allows the same disallowed IP on a guarded route when the allowed IP is used', async () => {
      const result = await evaluateAdminIpRequest({
        payload,
        pathname: '/admin/collections/users',
        clientIp: '203.0.113.7',
      })
      expect(result.allowed).toBe(true)
    })

    it('does NOT block a disallowed IP on the public recovery/frontend endpoints', async () => {
      for (const pathname of [
        '/api/find-password',
        '/api/account-request',
        '/admin/forgot',
        '/api/media/file/logo.png',
      ]) {
        const result = await evaluateAdminIpRequest({ payload, pathname, clientIp: '198.51.100.9' })
        expect(result.allowed).toBe(true)
      }
    })

    it('the escape hatch ADMIN_IP_ENFORCEMENT=off allows even a disallowed IP', async () => {
      const prev = process.env.ADMIN_IP_ENFORCEMENT
      process.env.ADMIN_IP_ENFORCEMENT = 'off'
      try {
        const result = await evaluateAdminIpRequest({
          payload,
          pathname: '/admin/collections/users',
          clientIp: '198.51.100.9',
        })
        expect(result.allowed).toBe(true)
        expect(result.reason).toBe('enforcement-disabled')
      } finally {
        if (prev === undefined) {
          delete process.env.ADMIN_IP_ENFORCEMENT
        } else {
          process.env.ADMIN_IP_ENFORCEMENT = prev
        }
      }
    })
  })

  describe('classifyAdminPath', () => {
    it('guards /admin and /api but exempts recovery, media, and the public frontend', () => {
      expect(classifyAdminPath('/admin')).toBe('guard')
      expect(classifyAdminPath('/admin/collections/users')).toBe('guard')
      expect(classifyAdminPath('/admin/login')).toBe('guard')
      expect(classifyAdminPath('/api/users/login')).toBe('guard')
      expect(classifyAdminPath('/api/users/me')).toBe('guard')

      expect(classifyAdminPath('/admin/forgot')).toBe('exempt')
      expect(classifyAdminPath('/admin/account-request')).toBe('exempt')
      expect(classifyAdminPath('/admin/logout')).toBe('exempt')
      expect(classifyAdminPath('/api/find-password')).toBe('exempt')
      expect(classifyAdminPath('/api/users/forgot-password')).toBe('exempt')
      expect(classifyAdminPath('/api/media/file/x.png')).toBe('exempt')
      expect(classifyAdminPath('/')).toBe('exempt')
      expect(classifyAdminPath('/some-frontend-page')).toBe('exempt')
    })
  })

  describe('field validation', () => {
    it('rejects a malformed ipAddress', async () => {
      const site = await makeSite()
      await expect(createRule(site, { ipAddress: '999.1.1.1' })).rejects.toThrow()
    })

    it('rejects validTo <= validFrom', async () => {
      const site = await makeSite()
      await expect(
        createRule(site, {
          ipAddress: '203.0.113.7',
          validFrom: '2026-06-01T00:00:00.000Z',
          validTo: '2026-05-01T00:00:00.000Z',
        }),
      ).rejects.toThrow()
    })

    it('accepts a valid rule (wildcard + valid window)', async () => {
      const site = await makeSite()
      await expect(createRule(site, { ipAddress: '10.0.*' })).resolves.toBeTypeOf('number')
    })
  })

  describe('bootstrap / real-flow: seeding example rules does NOT brick localhost', () => {
    it('after adminIpRulesStep, an unknown-IP localhost request to the admin is still ALLOWED', async () => {
      await deleteAllAdminRules()
      await adminIpRulesStep.run(payload)

      // localhost dev / no reverse proxy → clientIp undefined; the seeded active
      // `*` allow keeps the admin reachable.
      const undefinedIp = await evaluateAdminIpRequest({
        payload,
        pathname: '/admin',
        clientIp: undefined,
      })
      expect(undefinedIp.allowed).toBe(true)

      const anyIp = await evaluateAdminIpRequest({
        payload,
        pathname: '/admin/collections/users',
        clientIp: '198.51.100.9',
      })
      expect(anyIp.allowed).toBe(true)

      // Re-running the seed is idempotent (still 3 rules on the admin site).
      await adminIpRulesStep.run(payload)
      const rules = await payload.find({
        collection: 'adminIpRules',
        where: { siteId: { equals: adminSiteId } },
        pagination: false,
        overrideAccess: true,
      })
      expect(rules.docs).toHaveLength(3)

      await deleteAllAdminRules()
    })
  })
})
