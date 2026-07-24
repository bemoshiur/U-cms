import { toRelationId } from '../../collections/utils'
import type { SeedStep } from '../types'
import { ROLE_ADMIN_ROLE_ID } from './roles'

/** Default super-admin credentials, used only when the env vars below are unset. */
export const DEFAULT_SEED_ADMIN_EMAIL = 'admin@publicpulse.com.bd'
export const DEFAULT_SEED_ADMIN_PASSWORD = 'changeme-dev-only!'

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

    const existingUser = existing.docs[0]
    if (existingUser) {
      // Postgres `id` columns in this project are always integers (no UUID
      // adapter configured — see payload.config.ts), so a bare non-number
      // relation id should never occur; the type guard is just precise
      // about what `AdminMenu.id`/`Role.id` actually is (`number`).
      const currentRoleIds = (existingUser.roles ?? [])
        .map(toRelationId)
        .filter((id): id is number => typeof id === 'number')

      if (currentRoleIds.includes(roleAdminId)) {
        payload.logger.info(`[seed:super-admin] user "${email}" already exists — skipping.`)
        return
      }

      // Additive only: union, never replace — an operator may have granted
      // (or the account may otherwise hold) other roles since it was
      // created; this must not remove any of them.
      await payload.update({
        collection: 'users',
        id: existingUser.id,
        data: { roles: [...currentRoleIds, roleAdminId] },
        overrideAccess: true,
      })
      payload.logger.info(
        `[seed:super-admin] user "${email}" already exists — assigned missing role "${ROLE_ADMIN_ROLE_ID}".`,
      )
      return
    }

    if (usingDefaultPassword) {
      payload.logger.warn(
        '[seed:super-admin] SEED_ADMIN_PASSWORD is not set — seeding the super-admin with the ' +
          'default development-only password. This is NOT safe for any shared, staging, or ' +
          'production environment. Set SEED_ADMIN_PASSWORD before seeding outside local dev.',
      )
    }

    await payload.create({
      collection: 'users',
      data: { email, password, roles: [roleAdminId] },
      overrideAccess: true,
    })

    payload.logger.info(
      `[seed:super-admin] created super-admin user "${email}" with role "${ROLE_ADMIN_ROLE_ID}".`,
    )
  },
}
