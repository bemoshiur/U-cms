import { toRelationId } from '../../collections/utils'
import type { SeedStep } from '../types'
import { ROLE_ADMIN_ROLE_ID } from './roles'

/** Default super-admin credentials, used only when the env vars below are unset. */
export const DEFAULT_SEED_ADMIN_EMAIL = 'admin@publicpulse.com.bd'
export const DEFAULT_SEED_ADMIN_PASSWORD = 'changeme-dev-only!'

/**
 * SECURITY fail-fast (Task TR2 hardening): refuses to seed the KNOWN, built-in
 * default super-admin password (`DEFAULT_SEED_ADMIN_PASSWORD`) into a production
 * deployment. Seeding a public, internet-reachable URL with a hard-coded admin
 * password is a real credential exposure, so when `NODE_ENV==='production'` AND
 * `SEED_ADMIN_PASSWORD` is unset (i.e. the default would be written), this THROWS
 * with an actionable message instead of creating the account. Dev/test with the
 * default is unaffected. Only the PASSWORD is gated — the email default is fine.
 *
 * Pure + testable; called only on the CREATE path in `superAdminStep` (a re-seed
 * that merely HEALS an existing admin never writes a password, so the
 * lockout-safety heal path keeps working even without `SEED_ADMIN_PASSWORD`).
 */
export function assertSeedAdminPasswordSafeForProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'production' && !env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      '[seed:super-admin] SEED_ADMIN_PASSWORD is required when seeding in production — ' +
        'refusing to create the super-admin with the built-in development-only default password ' +
        '(a known credential on a public deployment is a security exposure). Set ' +
        'SEED_ADMIN_PASSWORD to a strong, unique value and re-run the seed.',
    )
  }
}

/**
 * Creates the initial super-admin user in the `users` auth collection, and
 * assigns it the `ROLE_ADMIN` super-admin role (see `rolesStep` — must run
 * first, per the registration order in `src/seed/index.ts`).
 *
 * Idempotent AND additive: if a user with the target email already exists,
 * this step does not touch its password/other fields, but it DOES still
 * check whether that user already holds `ROLE_ADMIN` and assigns it
 * (additively — unioned with whatever roles the account already has,
 * nothing removed) if not. This is the LOCKOUT SAFETY guarantee: re-running
 * seed against an environment that predates Task 1C (a `users` doc created
 * before `roles` existed) or any environment where the role assignment was
 * somehow lost heals itself on the next `pnpm seed`, rather than leaving
 * the seeded admin permanently roleless.
 *
 * Credentials come from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, falling
 * back to `DEFAULT_SEED_ADMIN_EMAIL` / `DEFAULT_SEED_ADMIN_PASSWORD`. A loud
 * warning is logged whenever the default password is used, since it must
 * never be relied on outside local development.
 */
export const superAdminStep: SeedStep = {
  name: 'super-admin',
  async run(payload) {
    const email = process.env.SEED_ADMIN_EMAIL || DEFAULT_SEED_ADMIN_EMAIL
    const usingDefaultPassword = !process.env.SEED_ADMIN_PASSWORD
    const password = process.env.SEED_ADMIN_PASSWORD || DEFAULT_SEED_ADMIN_PASSWORD

    const roleAdmin = await payload.find({
      collection: 'roles',
      where: { roleId: { equals: ROLE_ADMIN_ROLE_ID } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const roleAdminId = roleAdmin.docs[0]?.id
    if (roleAdminId === undefined) {
      throw new Error(
        `[seed:super-admin] role "${ROLE_ADMIN_ROLE_ID}" not found — the "roles" seed step must run before "super-admin" (see src/seed/index.ts).`,
      )
    }

    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })

    // Legacy login ID (Task 1D). Derived from the email local-part; only ever
    // SET when missing (never overwrites an operator's chosen value).
    const seededLoginId = email.split('@')[0]

    const existingUser = existing.docs[0]
    if (existingUser) {
      // Postgres `id` columns in this project are always integers (no UUID
      // adapter configured — see payload.config.ts), so a bare non-number
      // relation id should never occur; the type guard is just precise
      // about what `AdminMenu.id`/`Role.id` actually is (`number`).
      const currentRoleIds = (existingUser.roles ?? [])
        .map(toRelationId)
        .filter((id): id is number => typeof id === 'number')

      // Heal three things idempotently (LOCKOUT SAFETY — the seeded super-admin
      // must never be left unable to administer or log in):
      //  - roles: ensure ROLE_ADMIN is held (additive union, never replace).
      //  - status: ensure `active` — Task 1D's login gate blocks any non-active
      //    account, so a super-admin left `pending`/`dormant` (or with an
      //    undefined status predating Task 1D) would be locked out.
      //  - loginId: backfill if missing (new Task 1D field).
      const needsRole = !currentRoleIds.includes(roleAdminId)
      const needsStatus = existingUser.status !== 'active'
      const needsLoginId = !existingUser.loginId

      if (!needsRole && !needsStatus && !needsLoginId) {
        payload.logger.info(`[seed:super-admin] user "${email}" already exists — skipping.`)
        return
      }

      await payload.update({
        collection: 'users',
        id: existingUser.id,
        data: {
          ...(needsRole ? { roles: [...currentRoleIds, roleAdminId] } : {}),
          ...(needsStatus ? { status: 'active' } : {}),
          ...(needsLoginId ? { loginId: seededLoginId } : {}),
        },
        overrideAccess: true,
      })
      payload.logger.info(
        `[seed:super-admin] user "${email}" already exists — healed${needsRole ? ' role' : ''}${needsStatus ? ' status' : ''}${needsLoginId ? ' loginId' : ''}.`,
      )
      return
    }

    if (usingDefaultPassword) {
      // Hard fail-fast in production (public deploy); loud warning in dev/test.
      // Only reached on the CREATE path, so healing an existing admin is never
      // blocked (lockout safety) even when SEED_ADMIN_PASSWORD is unset.
      assertSeedAdminPasswordSafeForProduction()
      payload.logger.warn(
        '[seed:super-admin] SEED_ADMIN_PASSWORD is not set — seeding the super-admin with the ' +
          'default development-only password. This is NOT safe for any shared, staging, or ' +
          'production environment. Set SEED_ADMIN_PASSWORD before seeding outside local dev.',
      )
    }

    await payload.create({
      collection: 'users',
      data: {
        email,
        password,
        roles: [roleAdminId],
        // Active so the seeded super-admin can log in past Task 1D's status
        // gate; loginId backfilled from the email local-part.
        status: 'active',
        loginId: seededLoginId,
      },
      overrideAccess: true,
    })

    payload.logger.info(
      `[seed:super-admin] created super-admin user "${email}" with role "${ROLE_ADMIN_ROLE_ID}".`,
    )
  },
}
