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
  // Admin IP access control (Task 2C; refs 1-20/1-21).
  {
    menuKey: 'system.ipAccessControl',
    name: 'Admin IP Access Control',
    parentMenuKey: 'system',
    order: 8,
    collectionSlug: 'adminIpRules',
  },
  { menuKey: 'content', name: 'Content Management', order: 2 },
  {
    menuKey: 'content.media',
    name: 'Media Management',
    parentMenuKey: 'content',
    order: 1,
    collectionSlug: 'media',
  },
  // Board engine (Task 3A; refs 1-27..1-35, 1-77/1-78). `boardTypes` is
  // global; `boards` is tenant-scoped (per-site).
  {
    menuKey: 'content.boardTypes',
    name: 'Board Type Management',
    parentMenuKey: 'content',
    order: 2,
    collectionSlug: 'boardTypes',
  },
  {
    menuKey: 'content.boards',
    name: 'Board Management',
    parentMenuKey: 'content',
    order: 3,
    collectionSlug: 'boards',
  },
  // Content engine (Task 3B; refs 1-7, 1-28..1-41, 2-5..2-8). `posts` is
  // tenant-scoped (per-site); the two word-filter lists are global.
  {
    menuKey: 'content.posts',
    name: 'Post Management',
    parentMenuKey: 'content',
    order: 4,
    collectionSlug: 'posts',
  },
  {
    menuKey: 'content.profanityWords',
    name: 'Profanity Word Management',
    parentMenuKey: 'content',
    order: 5,
    collectionSlug: 'profanityWords',
  },
  {
    menuKey: 'content.memberBannedWords',
    name: 'Member Banned-Word Management',
    parentMenuKey: 'content',
    order: 6,
    collectionSlug: 'memberBannedWords',
  },
  // Per-site display components (Task 3C; refs 1-45..1-53, 2-1). All
  // tenant-scoped (per-site).
  {
    menuKey: 'content.notificationAreas',
    name: 'Notification Area Management',
    parentMenuKey: 'content',
    order: 7,
    collectionSlug: 'notificationAreas',
  },
  {
    menuKey: 'content.popups',
    name: 'Popup Management',
    parentMenuKey: 'content',
    order: 8,
    collectionSlug: 'popups',
  },
  {
    menuKey: 'content.banners',
    name: 'Banner Management',
    parentMenuKey: 'content',
    order: 9,
    collectionSlug: 'banners',
  },
  {
    menuKey: 'content.adminNotices',
    name: 'Administrator Notice Management',
    parentMenuKey: 'content',
    order: 10,
    collectionSlug: 'adminNotices',
  },
  {
    menuKey: 'content.guideMenus',
    name: 'Guide Menu Management',
    parentMenuKey: 'content',
    order: 11,
    collectionSlug: 'guideMenus',
  },
  // Menus + versioned web content + short URLs + site help (Task 3D; refs
  // 1-44/2-13, 2-2..2-4, 1-42/1-43, 1-80). menus/webContents/shortUrls are
  // tenant-scoped (per-site); helpEntries is global.
  {
    menuKey: 'content.menus',
    name: 'Menu Management',
    parentMenuKey: 'content',
    order: 12,
    collectionSlug: 'menus',
  },
  {
    menuKey: 'content.webContents',
    name: 'Web Content Management',
    parentMenuKey: 'content',
    order: 13,
    collectionSlug: 'webContents',
  },
  {
    menuKey: 'content.shortUrls',
    name: 'Short URL Management',
    parentMenuKey: 'content',
    order: 14,
    collectionSlug: 'shortUrls',
  },
  {
    menuKey: 'content.help',
    name: 'Site Help Management',
    parentMenuKey: 'content',
    order: 15,
    collectionSlug: 'helpEntries',
  },
  // Privacy Protection System (Task 2A / development-plan §2.5). The audit &
  // logging backbone: access history, login history, and the two permission
  // journals. `privacy.permissionLogs` gates BOTH permission-journal
  // collections (permissionChangeLogs + menuPermissionLogs share one node, per
  // the Task 2A brief); its `collectionSlug` points at the primary one.
  { menuKey: 'privacy', name: 'Privacy Protection', order: 3 },
  {
    menuKey: 'privacy.accessLogs',
    name: 'Access History',
    parentMenuKey: 'privacy',
    order: 1,
    collectionSlug: 'accessLogs',
  },
  {
    menuKey: 'privacy.loginHistory',
    name: 'Login History',
    parentMenuKey: 'privacy',
    order: 2,
    collectionSlug: 'loginHistory',
  },
  {
    menuKey: 'privacy.permissionLogs',
    name: 'Permission Change History',
    parentMenuKey: 'privacy',
    order: 3,
    collectionSlug: 'permissionChangeLogs',
  },
  // Public-site MEMBER management (Task 4B; refs 2-13). Gates the tenant-scoped
  // `members` auth collection — a SEPARATE audience from admin `users`.
  { menuKey: 'members', name: 'Member Management', order: 4 },
  {
    menuKey: 'members.manage',
    name: 'Member Accounts',
    parentMenuKey: 'members',
    order: 1,
    collectionSlug: 'members',
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
