import type { SeedStep } from '../types'

/**
 * Seed definitions for the two sites created by this step. Kept as a typed
 * constant (rather than inlined) so tests can assert against the same
 * source of truth.
 */
export const SEED_SITES = [
  {
    siteId: 'bos',
    name: 'Pulse CMS Back Office',
    url: 'http://localhost:3000/admin',
    isAdminSite: true,
  },
  {
    siteId: 'demo',
    name: 'Demo Site',
    url: 'http://localhost:3000',
    isAdminSite: false,
  },
] as const

/**
 * Creates the initial `sites` records: the admin back-office site (legacy
 * "bos") and a demo user-facing site.
 *
 * Idempotent: each site is looked up by its unique `siteId` before create,
 * so re-running this step (e.g. on every deploy / every `pnpm seed`
 * invocation) does not create duplicates.
 *
 * Must run after the `super-admin` step (see src/seed/index.ts) — later
 * phases may want to reference the seeded admin user from site-scoped
 * records.
 */
export const sitesStep: SeedStep = {
  name: 'sites',
  async run(payload) {
    for (const site of SEED_SITES) {
      const existing = await payload.find({
        collection: 'sites',
        where: { siteId: { equals: site.siteId } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })

      if (existing.docs.length > 0) {
        payload.logger.info(`[seed:sites] site "${site.siteId}" already exists — skipping.`)
        continue
      }

      await payload.create({
        collection: 'sites',
        data: site,
        overrideAccess: true,
      })

      payload.logger.info(`[seed:sites] created site "${site.siteId}".`)
    }
  },
}
