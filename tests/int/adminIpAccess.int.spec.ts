import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { adminIpRulesStep } from '@/seed/steps/adminIpRules'
import { isIpAllowedForAdmin } from '@/security/ipAccessGuard'
import { evaluateAdminIpRequest } from '@/security/adminIpEnforcement'
import type { ResolvedClientIp } from '@/security/adminIpEnforcement'

let payload: Payload
let adminSiteId: number

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 100000)}`
}

/** A trusted client IP (as if a correctly-configured reverse proxy resolved it). */
function trusted(ip: string): ResolvedClientIp {
  return { ip, trusted: true }
}
/** No trustworthy IP source (e.g. TRUSTED_PROXY_HOPS=0 / no proxy). */
const UNTRUSTED: ResolvedClientIp = { ip: undefined, trusted: false }

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
    it('empty ruleset → ALLOWED + unarmed (bootstrap safety)', async () => {
      const site = await makeSite()
      const decision = await isIpAllowedForAdmin(payload, '198.51.100.9', site)
      expect(decision.allowed).toBe(true)
      expect(decision.reason).toBe('no-rules-bootstrap')
      expect(decision.armed).toBe(false)
    })

    it('matching allow rule → ALLOWED + armed', async () => {
      const site = await makeSite()
      await createRule(site, { ipAddress: '203.0.113.7', accessType: 'allow' })
      const decision = await isIpAllowedForAdmin(payload, '203.0.113.7', site)
      expect(decision.allowed).toBe(true)
      expect(decision.armed).toBe(true)
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

    it('expired allow rule is ignored → DENIED + unarmed', async () => {
      const site = await makeSite()
      await createRule(site, {
        ipAddress: '203.0.113.7',
        accessType: 'allow',
        validFrom: '2000-01-01T00:00:00.000Z',
        validTo: '2001-01-01T00:00:00.000Z',
      })
      const decision = await isIpAllowedForAdmin(payload, '203.0.113.7', site)
      expect(decision.allowed).toBe(false)
      expect(decision.armed).toBe(false)
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

    it('inactive allow rule is ignored → DENIED + unarmed', async () => {
      const site = await makeSite()
      await createRule(site, { ipAddress: '203.0.113.7', accessType: 'allow', isActive: false })
      const decision = await isIpAllowedForAdmin(payload, '203.0.113.7', site)
      expect(decision.allowed).toBe(false)
      expect(decision.armed).toBe(false)
    })

    it('a rule on another site does not grant access here (wrong-site ignored)', async () => {
      const siteA = await makeSite()
      const siteB = await makeSite()
      await createRule(siteA, { ipAddress: '203.0.113.7', accessType: 'allow' })
      await createRule(siteB, { ipAddress: '10.0.0.1', accessType: 'allow' })
      expect((await isIpAllowedForAdmin(payload, '203.0.113.7', siteB)).allowed).toBe(false)
      expect((await isIpAllowedForAdmin(payload, '203.0.113.7', siteA)).allowed).toBe(true)
    })
  })

  describe('evaluateAdminIpRequest (enforcement + trust model + audit)', () => {
    beforeAll(async () => {
      await deleteAllAdminRules()
      await createRule(adminSiteId, { ipAddress: '203.0.113.7', accessType: 'allow' })
    })
    afterAll(async () => {
      await deleteAllAdminRules()
    })

    it('blocks a disallowed TRUSTED IP on a guarded admin route (403) + writes a denied accessLog', async () => {
      const pathname = `/admin/collections/users?probe=${unique('p')}`
      const result = await evaluateAdminIpRequest({
        payload,
        pathname,
        client: trusted('198.51.100.9'),
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

    it('allows a guarded route when the allowlisted TRUSTED IP is used', async () => {
      const result = await evaluateAdminIpRequest({
        payload,
        pathname: '/admin/collections/users',
        client: trusted('203.0.113.7'),
      })
      expect(result.allowed).toBe(true)
    })

    it('GUARDS the media collection endpoint but EXEMPTS the media file route', async () => {
      const collection = await evaluateAdminIpRequest({
        payload,
        pathname: '/api/media/123',
        client: trusted('198.51.100.9'),
      })
      expect(collection.allowed).toBe(false)
      expect(collection.status).toBe(403)

      const file = await evaluateAdminIpRequest({
        payload,
        pathname: '/api/media/file/logo.png',
        client: trusted('198.51.100.9'),
      })
      expect(file.allowed).toBe(true)
    })

    it('does NOT block a disallowed IP on the public recovery/frontend endpoints', async () => {
      for (const pathname of ['/api/find-password', '/api/account-request', '/admin/forgot']) {
        const result = await evaluateAdminIpRequest({
          payload,
          pathname,
          client: trusted('198.51.100.9'),
        })
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
          client: trusted('198.51.100.9'),
        })
        expect(result.allowed).toBe(true)
        expect(result.reason).toBe('enforcement-disabled')
      } finally {
        if (prev === undefined) delete process.env.ADMIN_IP_ENFORCEMENT
        else process.env.ADMIN_IP_ENFORCEMENT = prev
      }
    })
  })

  describe('trust model: untrusted IP (no TRUSTED_PROXY_HOPS)', () => {
    afterAll(async () => {
      await deleteAllAdminRules()
    })

    it('ARMED allowlist + no trusted IP + PRODUCTION → FAIL CLOSED (503)', async () => {
      await deleteAllAdminRules()
      await createRule(adminSiteId, { ipAddress: '203.0.113.7', accessType: 'allow' })
      vi.stubEnv('NODE_ENV', 'production')
      try {
        const result = await evaluateAdminIpRequest({
          payload,
          pathname: '/admin',
          client: UNTRUSTED,
        })
        expect(result.allowed).toBe(false)
        expect(result.status).toBe(503)
        expect(result.reason).toBe('no-trusted-ip-fail-closed')
      } finally {
        vi.unstubAllEnvs()
      }
    })

    it('ARMED allowlist + no trusted IP + DEV → permissive (localhost not bricked)', async () => {
      // NODE_ENV is 'test' here (not production) → dev-permissive branch.
      const result = await evaluateAdminIpRequest({
        payload,
        pathname: '/admin',
        client: UNTRUSTED,
      })
      expect(result.allowed).toBe(true)
    })

    it('UNARMED (empty) allowlist + no trusted IP → ALLOW regardless of env', async () => {
      await deleteAllAdminRules()
      vi.stubEnv('NODE_ENV', 'production')
      try {
        const result = await evaluateAdminIpRequest({
          payload,
          pathname: '/admin',
          client: UNTRUSTED,
        })
        expect(result.allowed).toBe(true)
        expect(result.reason).toBe('unarmed-open')
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })

  describe('fail-open vs fail-closed discipline', () => {
    it('empty ruleset (known-safe) → ALLOW, but a guard THROW (unknown) → FAIL CLOSED 503', async () => {
      await deleteAllAdminRules()
      const known = await evaluateAdminIpRequest({
        payload,
        pathname: '/admin',
        client: trusted('198.51.100.9'),
      })
      expect(known.allowed).toBe(true) // empty ruleset → no-rules-bootstrap

      const throwingPayload = {
        find: async () => {
          throw new Error('db exploded')
        },
        logger: { error: () => undefined },
      } as unknown as Payload
      const unknown = await evaluateAdminIpRequest({
        payload: throwingPayload,
        pathname: '/admin',
        client: trusted('198.51.100.9'),
      })
      expect(unknown.allowed).toBe(false)
      expect(unknown.status).toBe(503)
      expect(unknown.reason).toBe('guard-error-fail-closed')
    })
  })

  describe('field validation', () => {
    it('rejects a malformed ipAddress', async () => {
      const site = await makeSite()
      await expect(createRule(site, { ipAddress: '999.1.1.1' })).rejects.toThrow()
    })

    it('rejects validTo <= validFrom on create', async () => {
      const site = await makeSite()
      await expect(
        createRule(site, {
          ipAddress: '203.0.113.7',
          validFrom: '2026-06-01T00:00:00.000Z',
          validTo: '2026-05-01T00:00:00.000Z',
        }),
      ).rejects.toThrow()
    })

    it('rejects a validTo-ONLY PATCH that sets validTo <= the persisted validFrom', async () => {
      const site = await makeSite()
      const id = await createRule(site, {
        ipAddress: '203.0.113.7',
        validFrom: '2026-06-01T00:00:00.000Z',
        validTo: '2026-12-01T00:00:00.000Z',
      })
      // PATCH carrying ONLY validTo (no validFrom) — the validator must fetch the
      // persisted validFrom to still enforce validTo > validFrom.
      await expect(
        payload.update({
          collection: 'adminIpRules',
          id,
          data: { validTo: '2026-05-01T00:00:00.000Z' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('accepts a valid rule (wildcard + valid window)', async () => {
      const site = await makeSite()
      await expect(createRule(site, { ipAddress: '10.0.*' })).resolves.toBeTypeOf('number')
    })
  })

  describe('bootstrap / real-flow: seeding example rules does NOT brick a dev session', () => {
    it('after adminIpRulesStep, an untrusted (localhost dev) request to the admin is still ALLOWED', async () => {
      await deleteAllAdminRules()
      await adminIpRulesStep.run(payload)

      // NODE_ENV=test (dev-like) → untrusted + armed → dev-permissive → allowed.
      const result = await evaluateAdminIpRequest({
        payload,
        pathname: '/admin',
        client: UNTRUSTED,
      })
      expect(result.allowed).toBe(true)

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
