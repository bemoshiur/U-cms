import type { SeedStep } from '../types'

/** Default super-admin credentials, used only when the env vars below are unset. */
export const DEFAULT_SEED_ADMIN_EMAIL = 'admin@publicpulse.com.bd'
export const DEFAULT_SEED_ADMIN_PASSWORD = 'changeme-dev-only!'

/**
 * Creates the initial super-admin user in the `users` auth collection.
 *
 * Idempotent: if a user with the target email already exists, this step
 * logs and returns without modifying anything, so it is safe to run on
 * every deploy / every `pnpm seed` invocation.
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

    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      payload.logger.info(`[seed:super-admin] user "${email}" already exists — skipping.`)
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
      data: { email, password },
      overrideAccess: true,
    })

    payload.logger.info(`[seed:super-admin] created super-admin user "${email}".`)
  },
}
