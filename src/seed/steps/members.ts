import type { Payload } from 'payload'

import { buildTermsConsents } from '../../members/terms'
import type { SeedStep } from '../types'

/** Default dev-only member password (satisfies the member policy: 8+, 2+ classes). */
export const DEFAULT_SEED_MEMBER_PASSWORD = 'Pulse-Member-2026'

/**
 * SECURITY fail-fast (D1): refuses to seed the KNOWN, built-in default member
 * password (`DEFAULT_SEED_MEMBER_PASSWORD`) into a production deployment. The
 * demo member is LOGIN-CAPABLE and this repo is public, so a hard-coded password
 * on a public URL is a real credential exposure. When `NODE_ENV==='production'`
 * AND `SEED_MEMBER_PASSWORD` is unset (the default would be written), this THROWS
 * with an actionable message instead of creating the member. Dev/test with the
 * default is unaffected. Mirrors `assertSeedAdminPasswordSafeForProduction` for
 * the super-admin (TR2), which did not cover members.
 */
export function assertSeedMemberPasswordSafeForProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'production' && !env.SEED_MEMBER_PASSWORD) {
    throw new Error(
      '[seed:members] SEED_MEMBER_PASSWORD is required when seeding a member in production — ' +
        'refusing to create the login-capable demo member with the built-in development-only ' +
        'default password (a known credential on a public deployment is a security exposure). Set ' +
        'SEED_MEMBER_PASSWORD to a strong, unique value and re-run the seed.',
    )
  }
}

/**
 * Example public-site members on the demo site (Task 4B). One `active` (so the
 * login/profile flows are exercisable out of the box) and one `pending` (so the
 * approval gate is demonstrable). Exported so tests can assert against the same
 * source of truth. Passwords come from `SEED_MEMBER_PASSWORD` (a dev-only
 * default is used otherwise, with a warning).
 */
export const SEED_MEMBERS: {
  loginId: string
  email: string
  name: string
  status: 'active' | 'pending'
}[] = [
  {
    loginId: 'demo-member',
    email: 'member@demo.example.com',
    name: 'Demo Member',
    status: 'active',
  },
  {
    loginId: 'pending-member',
    email: 'pending@demo.example.com',
    name: 'Pending Member',
    status: 'pending',
  },
]

/**
 * Seeds the example members on the demo site. Idempotent: each is looked up by
 * (tenant, loginId) before create, so re-running `pnpm seed` adds nothing.
 * Runs after `publicSiteStep` (needs the demo site to exist).
 */
export const membersStep: SeedStep = {
  name: 'members',
  async run(payload: Payload) {
    const found = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const demo = found.docs[0]
    if (!demo) {
      throw new Error('[seed:members] demo site not found — did sitesStep run first?')
    }

    const usingDefaultPassword = !process.env.SEED_MEMBER_PASSWORD
    const password = process.env.SEED_MEMBER_PASSWORD || DEFAULT_SEED_MEMBER_PASSWORD
    let warnedDefault = false

    for (const member of SEED_MEMBERS) {
      const existing = await payload.find({
        collection: 'members',
        where: {
          and: [{ tenant: { equals: demo.id } }, { loginId: { equals: member.loginId } }],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      if (existing.docs.length > 0) {
        payload.logger.info(`[seed:members] "${member.loginId}" already exists — skipping.`)
        continue
      }
      if (usingDefaultPassword) {
        // Hard fail-fast in production (public deploy); loud warning in dev/test.
        // Only reached on the CREATE path, so an idempotent re-seed of already-
        // seeded members never throws solely because SEED_MEMBER_PASSWORD is unset.
        assertSeedMemberPasswordSafeForProduction()
        if (!warnedDefault) {
          payload.logger.warn(
            '[seed:members] SEED_MEMBER_PASSWORD is not set — seeding demo members with a ' +
              'development-only default password. Not safe outside local dev.',
          )
          warnedDefault = true
        }
      }
      await payload.create({
        collection: 'members',
        data: {
          loginId: member.loginId,
          email: member.email,
          name: member.name,
          password,
          status: member.status,
          tenant: demo.id,
          marketingConsent: false,
          termsConsents: await buildTermsConsents(payload, demo.id),
        },
        overrideAccess: true,
      })
      payload.logger.info(`[seed:members] created member "${member.loginId}" (${member.status}).`)
    }
  },
}
