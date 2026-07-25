import type { SeedStep } from '../types'

/**
 * Example admin IP access-control rules (Task 2C; refs 1-20/1-21). Seeded
 * against the admin back-office site so operators see the three pattern shapes
 * (bare `*`, exact IPv4, exact IPv6) with the request metadata filled in.
 *
 * ## Bootstrap safety — why the `*` allow is ACTIVE
 *
 * The enforcement guard (src/security/*) is default-deny *once any rule exists*.
 * If the seed installed only the two localhost rules, a real deployment behind a
 * reverse proxy — whose admins connect from a non-localhost IP — would be locked
 * out the instant the seed ran (localhost is also unreachable when the proxy
 * forwards the real client IP, not 127.0.0.1). So the seed installs an ACTIVE
 * bare-`*` ALLOW rule, which keeps the admin OPEN to every IP out of the box.
 * IP restriction stays effectively OFF until an operator deactivates/deletes
 * that `*` rule and adds allow rules for their own networks (at which point
 * default-deny arms). This is the documented, non-bricking default.
 */

const FAR_FUTURE = '2999-12-31T23:59:59.000Z'
const LONG_PAST = '2000-01-01T00:00:00.000Z'

type IpRuleSeed = {
  ipAddress: string
  accessType: 'allow' | 'block'
  memo: string
}

export const SEED_IP_RULES: IpRuleSeed[] = [
  {
    ipAddress: '*',
    accessType: 'allow',
    memo: 'BOOTSTRAP: allows ALL IPs, so admin IP restriction is effectively OFF. To enforce an allowlist, deactivate or delete this rule and add allow rules for your office/VPN IPs (default-deny then applies).',
  },
  {
    ipAddress: '127.0.0.1',
    accessType: 'allow',
    memo: 'Example: exact IPv4 (localhost). Effective only when a reverse proxy forwards the real client IP via X-Forwarded-For.',
  },
  {
    ipAddress: '::1',
    accessType: 'allow',
    memo: 'Example: exact IPv6 (localhost).',
  },
]

/**
 * Idempotent: each rule is looked up by (siteId, ipAddress) before create, so
 * re-running the seed never duplicates and never clobbers an operator's later
 * edits (e.g. deleting the `*` rule to enable enforcement). Must run after the
 * `sites` step (needs the admin site).
 */
export const adminIpRulesStep: SeedStep = {
  name: 'admin-ip-rules',
  async run(payload) {
    const adminSite = await payload.find({
      collection: 'sites',
      where: { isAdminSite: { equals: true } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const site = adminSite.docs[0]
    if (!site) {
      payload.logger.warn('[seed:admin-ip-rules] no admin site found — skipping.')
      return
    }

    for (const rule of SEED_IP_RULES) {
      const existing = await payload.find({
        collection: 'adminIpRules',
        where: {
          and: [{ siteId: { equals: site.id } }, { ipAddress: { equals: rule.ipAddress } }],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })

      if (existing.docs.length > 0) {
        payload.logger.info(
          `[seed:admin-ip-rules] rule "${rule.ipAddress}" already exists — skipping.`,
        )
        continue
      }

      await payload.create({
        collection: 'adminIpRules',
        data: {
          applicantName: 'System',
          affiliation: 'Pulse CMS (seed)',
          phone: '000-0000-0000',
          memo: rule.memo,
          ipAddress: rule.ipAddress,
          accessType: rule.accessType,
          validFrom: LONG_PAST,
          validTo: FAR_FUTURE,
          isActive: true,
          siteId: site.id,
        },
        overrideAccess: true,
      })
      payload.logger.info(`[seed:admin-ip-rules] created rule "${rule.ipAddress}".`)
    }
  },
}
