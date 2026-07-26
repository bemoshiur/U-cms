import type { SeedStep } from '../types'

/**
 * Example admin IP access-control rules (Task 2C; refs 1-20/1-21). Seeded
 * against the admin back-office site so operators see the three pattern shapes
 * (bare `*`, exact IPv4, exact IPv6) with the request metadata filled in.
 *
 * ## Bootstrap safety — why the `*` allow is ACTIVE
 *
 * The seed installs an ACTIVE bare-`*` ALLOW rule so that, once an operator
 * configures `TRUSTED_PROXY_HOPS`, every trusted client IP is allowed out of the
 * box (IP restriction effectively OFF) until they deactivate/delete the `*` rule
 * and add allow rules for their own networks.
 *
 * Interaction with the trust model (src/security/adminIpEnforcement.ts):
 *   - `next dev` (development): untrusted requests are permissive → localhost is
 *     reachable regardless of these rules.
 *   - Production WITH `TRUSTED_PROXY_HOPS` set: the `*` allow matches every
 *     trusted IP → open until narrowed.
 *   - Production WITHOUT `TRUSTED_PROXY_HOPS` (armed list, no trustworthy IP):
 *     the guard FAILS CLOSED (503) — the operator must set `TRUSTED_PROXY_HOPS`
 *     or `ADMIN_IP_ENFORCEMENT=off`. A truly fresh (un-seeded, empty) install
 *     stays OPEN via the "empty ruleset = open" net.
 * None of these hard-brick: a fresh install and localhost dev are always
 * reachable, and the escape hatch always recovers.
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
    memo: 'BOOTSTRAP: allows ALL (trusted) IPs, so admin IP restriction is effectively OFF. In production set TRUSTED_PROXY_HOPS so the real client IP can be resolved; then deactivate/delete this rule and add allow rules for your office/VPN IPs (default-deny then applies).',
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
          affiliation: 'U-CMS (seed)',
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
