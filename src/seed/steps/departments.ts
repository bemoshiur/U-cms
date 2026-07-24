import type { SeedStep } from '../types'

/**
 * Placeholder department tree seeded for local dev / demo purposes (real
 * org structure TBD by the owner). Kept as a typed constant so tests can
 * assert against the same source of truth rather than duplicating literals
 * (mirrors `SEED_SITES` in `src/seed/steps/sites.ts`).
 */
export const SEED_DEPARTMENTS = {
  root: { name: 'Head Office' },
  children: [{ name: 'Management Support' }, { name: 'Development' }],
} as const

/**
 * Creates the placeholder root department ("Head Office") and its two
 * children ("Management Support", "Development") — ref 1-14 + TODO 1.19.
 *
 * Idempotent: each department is looked up by (name, parent) before
 * create — `departments.name` isn't unique on its own (siblings under
 * different parents may share a name), so the lookup always scopes by
 * parent too. Safe to re-run on every deploy / every `pnpm seed`
 * invocation.
 */
export const departmentsStep: SeedStep = {
  name: 'departments',
  async run(payload) {
    const existingRoot = await payload.find({
      collection: 'departments',
      where: {
        and: [{ name: { equals: SEED_DEPARTMENTS.root.name } }, { parent: { exists: false } }],
      },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })

    let rootId = existingRoot.docs[0]?.id

    if (rootId === undefined) {
      const created = await payload.create({
        collection: 'departments',
        data: { name: SEED_DEPARTMENTS.root.name, order: 0 },
        overrideAccess: true,
      })
      rootId = created.id
      payload.logger.info(
        `[seed:departments] created root department "${SEED_DEPARTMENTS.root.name}".`,
      )
    } else {
      payload.logger.info(
        `[seed:departments] root department "${SEED_DEPARTMENTS.root.name}" already exists — skipping.`,
      )
    }

    for (const [index, child] of SEED_DEPARTMENTS.children.entries()) {
      const existingChild = await payload.find({
        collection: 'departments',
        where: {
          and: [{ name: { equals: child.name } }, { parent: { equals: rootId } }],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })

      if (existingChild.docs.length > 0) {
        payload.logger.info(
          `[seed:departments] department "${child.name}" already exists — skipping.`,
        )
        continue
      }

      await payload.create({
        collection: 'departments',
        data: { name: child.name, parent: rootId, order: index },
        overrideAccess: true,
      })
      payload.logger.info(`[seed:departments] created department "${child.name}".`)
    }
  },
}
