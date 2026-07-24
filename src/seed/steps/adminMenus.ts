import type { SeedStep } from '../types'

type MenuNodeSeed = {
  collectionSlug?: string
  menuKey: string
  name: string
  order: number
  parentMenuKey?: string
}

/**
 * The admin menu tree (ref 1-13's checkbox-tree source data; Task 1C brief
 * Part 5). Order matters: every parent is listed before its children, so
 * `adminMenusStep` can resolve each `parentMenuKey` from what it has
 * already created/found earlier in this same run. `collectionSlug` links a
 * leaf menu to the Payload collection it gates (matching
 * `src/access/hasMenuAccess.ts`'s wiring); pure grouping nodes (`system`,
 * `content`, `system.codes`) have none.
 *
 * Future phases append new nodes here — never remove or repurpose an
 * existing `menuKey` (see the "PERMANENT identifier" warning on
 * `src/collections/AdminMenus.ts`).
 */
export const SEED_ADMIN_MENUS: MenuNodeSeed[] = [
  { menuKey: 'system', name: 'System Management', order: 1 },
  {
    menuKey: 'system.sites',
    name: 'Site Information Management',
    parentMenuKey: 'system',
    order: 1,
    collectionSlug: 'sites',
  },
  {
    menuKey: 'system.admins',
    name: 'Admin Account Management',
    parentMenuKey: 'system',
    order: 2,
    collectionSlug: 'users',
  },
  {
    menuKey: 'system.roles',
    name: 'Admin Role Management',
    parentMenuKey: 'system',
    order: 3,
    collectionSlug: 'roles',
  },
  {
    menuKey: 'system.menus',
    name: 'Admin Menu Management',
    parentMenuKey: 'system',
    order: 4,
    collectionSlug: 'adminMenus',
  },
  {
    menuKey: 'system.departments',
    name: 'Department Management',
    parentMenuKey: 'system',
    order: 5,
    collectionSlug: 'departments',
  },
  { menuKey: 'system.codes', name: 'Code Management', parentMenuKey: 'system', order: 6 },
  {
    menuKey: 'system.codes.classifications',
    name: 'Code Classifications',
    parentMenuKey: 'system.codes',
    order: 1,
    collectionSlug: 'codeClassifications',
  },
  {
    menuKey: 'system.codes.groups',
    name: 'Code Groups',
    parentMenuKey: 'system.codes',
    order: 2,
    collectionSlug: 'codeGroups',
  },
  {
    menuKey: 'system.codes.detail',
    name: 'Detail Codes',
    parentMenuKey: 'system.codes',
    order: 3,
    collectionSlug: 'codes',
  },
  {
    menuKey: 'system.passwordPolicies',
    name: 'Password Composition Rules',
    parentMenuKey: 'system',
    order: 7,
    collectionSlug: 'passwordPolicies',
  },
  { menuKey: 'content', name: 'Content Management', order: 2 },
  {
    menuKey: 'content.media',
    name: 'Media Management',
    parentMenuKey: 'content',
    order: 1,
    collectionSlug: 'media',
  },
]

/**
 * Creates the admin menu tree. Idempotent AND additive/non-destructive per
 * the brief: an already-existing `menuKey` is left completely untouched
 * (not updated), so this step never clobbers an admin's later edits (e.g. a
 * renamed display `name`) to a previously-seeded node, and future phases
 * can safely append new entries to `SEED_ADMIN_MENUS` without this step
 * ever deleting/renaming what's already there.
 */
export const adminMenusStep: SeedStep = {
  name: 'admin-menus',
  async run(payload) {
    // Postgres `id` columns in this project are always integers (no UUID
    // adapter configured — see payload.config.ts).
    const idByMenuKey = new Map<string, number>()

    for (const node of SEED_ADMIN_MENUS) {
      const existing = await payload.find({
        collection: 'adminMenus',
        where: { menuKey: { equals: node.menuKey } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })

      const existingDoc = existing.docs[0]
      if (existingDoc) {
        idByMenuKey.set(node.menuKey, existingDoc.id)
        payload.logger.info(`[seed:admin-menus] "${node.menuKey}" already exists — skipping.`)
        continue
      }

      const parentId = node.parentMenuKey ? idByMenuKey.get(node.parentMenuKey) : undefined
      if (node.parentMenuKey && parentId === undefined) {
        // Programmer error (bad ordering in SEED_ADMIN_MENUS), not a runtime
        // data condition — fail loudly rather than silently creating an
        // orphaned/mis-parented node.
        throw new Error(
          `[seed:admin-menus] parent "${node.parentMenuKey}" for "${node.menuKey}" was not created earlier in SEED_ADMIN_MENUS — fix the ordering.`,
        )
      }

      const created = await payload.create({
        collection: 'adminMenus',
        data: {
          menuKey: node.menuKey,
          name: node.name,
          order: node.order,
          ...(parentId !== undefined ? { parent: parentId } : {}),
          ...(node.collectionSlug !== undefined ? { collectionSlug: node.collectionSlug } : {}),
        },
        overrideAccess: true,
      })

      idByMenuKey.set(node.menuKey, created.id)
      payload.logger.info(`[seed:admin-menus] created "${node.menuKey}".`)
    }
  },
}
