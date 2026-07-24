import type { SeedStep } from '../types'

/** roleId of the built-in super-admin role — see `superAdminStep` for the account it's assigned to. */
export const ROLE_ADMIN_ROLE_ID = 'ROLE_ADMIN'

/**
 * Creates the built-in `ROLE_ADMIN` super-admin role idempotently.
 * `isSuper: true` means holders bypass every menu permission check (see
 * `src/access/hasMenuAccess.ts`) — this is the LOCKOUT SAFETY anchor: as
 * long as this role exists and the seeded super-admin (see
 * `superAdminStep`) holds it, the admin backend can never lock itself out
 * regardless of what `roles`/`adminMenus` data an operator later edits.
 *
 * Must run before `superAdminStep`, which looks this role up by `roleId`
 * to assign it — see the registration order in `src/seed/index.ts`.
 */
export const rolesStep: SeedStep = {
  name: 'roles',
  async run(payload) {
    const existing = await payload.find({
      collection: 'roles',
      where: { roleId: { equals: ROLE_ADMIN_ROLE_ID } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      payload.logger.info(`[seed:roles] role "${ROLE_ADMIN_ROLE_ID}" already exists — skipping.`)
      return
    }

    await payload.create({
      collection: 'roles',
      data: {
        roleId: ROLE_ADMIN_ROLE_ID,
        name: 'Super Administrator',
        description: 'Unrestricted access to every admin menu and collection (isSuper bypass).',
        isSuper: true,
      },
      overrideAccess: true,
    })

    payload.logger.info(`[seed:roles] created role "${ROLE_ADMIN_ROLE_ID}".`)
  },
}
