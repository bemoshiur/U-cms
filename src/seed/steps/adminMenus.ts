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
  // System-wide error log (Task 5C; refs 1-56..1-59). Gates the errorLogs
  // collection (list + user-centric search), the /admin/error-statistics view
  // (period/type/URL tabs + drill-down), and the /api/errorLogs/stats export.
  {
    menuKey: 'system.errorLogs',
    name: 'Error Log',
    parentMenuKey: 'system',
    order: 9,
    collectionSlug: 'errorLogs',
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
  // Survey system (Task 4D; refs 2-9..2-12). ONE menu gates surveys +
  // surveyQuestions + surveyResponses (all tenant-scoped, per-site);
  // `collectionSlug` points at the primary `surveys` collection for nav.
  {
    menuKey: 'content.surveys',
    name: 'Survey Management',
    parentMenuKey: 'content',
    order: 16,
    collectionSlug: 'surveys',
  },
  // Versioned privacy/terms documents (Task 4E; refs 2-14..2-16). Tenant-scoped
  // (per-site), gated here; the five fixed categories live in src/content/terms.ts.
  {
    menuKey: 'content.terms',
    name: 'Privacy Policy Terms Management',
    parentMenuKey: 'content',
    order: 17,
    collectionSlug: 'termsDocuments',
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
  // Personal-Information Access History (Task 6A; refs 3-8, 1-36). Gates the
  // `personalInfoAccessLogs` collection (the log of every member-PII touch), its
  // masked CSV export, and — via `hasMenuAccess(privacy.personalInfoLogs)` — the
  // FULL (unmasked) member export tier. The privacy officer holds this grant.
  {
    menuKey: 'privacy.personalInfoLogs',
    name: 'Personal Info Access History',
    parentMenuKey: 'privacy',
    order: 4,
    collectionSlug: 'personalInfoAccessLogs',
  },
  // Auto-generated privacy organization chart (Task 6C; ref 3-10). A VIEW grant
  // (no collection of its own — the chart is derived from privacy-role
  // assignments); gates the /admin/privacy-org-chart custom view. The seeded
  // privacy roles (ROLE_PRIVACY_OFFICER/DEPUTY/TEAM/STAFF) all grant this menu.
  {
    menuKey: 'privacy.orgChart',
    name: 'Privacy Organization Chart',
    parentMenuKey: 'privacy',
    order: 5,
  },
  // Security-document libraries (Task 6D; ref 3-4). A single VIEW/grant node
  // gating the FOUR §3 document boards (보안교육/보안사례/관리계획/대응지침), which are
  // mounted board-engine records flagged `securityDoc: true` — "implement once,
  // mount four times", no new code (plan §2.3). Gates those boards + their posts
  // via `securityDocScopedAccess` (src/access/securityDocs.ts), so ONLY a
  // privacy-role (or super) admin can reach the security docs — a general content
  // admin cannot. No `collectionSlug`: the flagged rows live in the shared
  // `boards`/`posts` collections, filtered by the access gate.
  {
    menuKey: 'privacy.securityDocs',
    name: 'Security Documents',
    parentMenuKey: 'privacy',
    order: 6,
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
  // Site Statistics (Task 4E raw-data collections; refs 2-17..2-20). The
  // satisfaction ratings + public traffic log are tenant-scoped raw data that
  // feed the Phase-5 statistics dashboards (aggregation is Phase 5).
  { menuKey: 'statistics', name: 'Site Statistics', order: 5 },
  {
    menuKey: 'statistics.satisfaction',
    name: 'Satisfaction Ratings',
    parentMenuKey: 'statistics',
    order: 1,
    collectionSlug: 'satisfactionRatings',
  },
  {
    menuKey: 'statistics.traffic',
    name: 'Traffic Log',
    parentMenuKey: 'statistics',
    order: 2,
    collectionSlug: 'pageViews',
  },
  // Download statistics (Task 5B; TODO 5.3, ref 2-18). A VIEW grant (no
  // collection of its own — the cumulative counts live on posts.attachments);
  // gates /admin/download-statistics + /api/posts/download-stats. `statistics.
  // satisfaction` above doubles as the Task 5B satisfaction-statistics grant
  // (one key gates both the raw ratings AND the dashboard, exactly as
  // `statistics.traffic` gates both the traffic log and the traffic view).
  {
    menuKey: 'statistics.downloads',
    name: 'Download Statistics',
    parentMenuKey: 'statistics',
    order: 3,
  },
  // Web-accessibility auto-diagnosis (Task 8.2; refs 2-21..2-23). Gates the
  // accessibilityScanResults collection, the two custom views (results/detail +
  // statistics/report), and the export endpoints. Legacy menu path
  // 사이트 통계 > 웹접근성 자동진단.
  {
    menuKey: 'statistics.accessibility',
    name: 'Web Accessibility Auto-Diagnosis',
    parentMenuKey: 'statistics',
    order: 4,
    collectionSlug: 'accessibilityScanResults',
  },
  // Public-data Standardization module (Phase 8, Task 8.1a; 공공데이터 표준화 관리,
  // refs 1-60..1-65, 1-74). GLOBAL (non-tenant) dictionaries + a read-only code
  // specification report, all gated behind the dedicated ROLE_DBA (see
  // src/seed/steps/standardizationRoles.ts). `standardization.codeSpec` is a
  // VIEW grant (no collectionSlug — the report reads the existing `codes`).
  { menuKey: 'standardization', name: 'Public Data Standardization', order: 6 },
  {
    menuKey: 'standardization.domains',
    name: 'Standard Domain Dictionary',
    parentMenuKey: 'standardization',
    order: 1,
    collectionSlug: 'standardDomains',
  },
  {
    menuKey: 'standardization.words',
    name: 'Standard Word Dictionary',
    parentMenuKey: 'standardization',
    order: 2,
    collectionSlug: 'standardWords',
  },
  {
    menuKey: 'standardization.terms',
    name: 'Standard Term Dictionary',
    parentMenuKey: 'standardization',
    order: 3,
    collectionSlug: 'standardTerms',
  },
  {
    menuKey: 'standardization.codeSpec',
    name: 'Code Specification',
    parentMenuKey: 'standardization',
    order: 4,
  },
  // Public-data Standardization ENGINE (Phase 8, Task 8.1b; refs 1-66..1-76).
  // All DBA-only (the ROLE_DBA union-heals these grants — see
  // standardizationRoles.ts). Proposal workflow + table settings gate their own
  // collections; the inspection / self-check-statistics keys are VIEW grants
  // (self-check has a backing collection).
  {
    menuKey: 'standardization.proposals',
    name: 'Standardization Proposal',
    parentMenuKey: 'standardization',
    order: 5,
    collectionSlug: 'standardizationProposals',
  },
  {
    menuKey: 'standardization.tableSettings',
    name: 'Table Standard Settings',
    parentMenuKey: 'standardization',
    order: 6,
    collectionSlug: 'tableStandardSettings',
  },
  {
    menuKey: 'standardization.metaInspection',
    name: 'Meta Term Inspection',
    parentMenuKey: 'standardization',
    order: 7,
  },
  {
    menuKey: 'standardization.selfCheck',
    name: 'Standardization Self-Check',
    parentMenuKey: 'standardization',
    order: 8,
    collectionSlug: 'standardizationSelfChecks',
  },
  {
    menuKey: 'standardization.selfCheckStats',
    name: 'Self-Check Statistics',
    parentMenuKey: 'standardization',
    order: 9,
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
