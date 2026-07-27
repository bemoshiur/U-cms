import { toRelationId } from '../../collections/utils'
import { ROLE_DBA, STANDARDIZATION_MENU_KEYS } from '../../standardization/constants'
import type { SeedStep } from '../types'
import { DEFAULT_SEED_ADMIN_EMAIL } from './superAdmin'

/**
 * DBA role for the Public-data Standardization module (Phase 8, Task 8.1a; plan
 * §2.2). Follows the EXACT privacy-roles template
 * (`privacyRoles.ts` + `privacyMenuGrants.ts`): a dedicated `ROLE_DBA` (a
 * `roles` doc, menu-grant model, NOT isSuper) that grants the four
 * standardization menu keys (domains / words / terms / code-spec), seeded
 * idempotently, and assigned to the seeded super-admin (additive heal) so the
 * whole module renders out of the box against a real account.
 *
 * The grants are UNIONed onto whatever the role already holds (an operator's
 * later hand-edits are never removed), and the role is only updated when a grant
 * is actually missing — so a general content admin, holding none of these, sees
 * none of the standardization surface (server-side `hasMenuAccess`, not just
 * nav-hidden), while the DBA (and the super-admin) see all of it.
 *
 * Must run AFTER `adminMenusStep` (needs the four `standardization.*` menus),
 * `rolesStep`/`superAdminStep` (the super-admin must exist to be assigned) — see
 * the registration order in `src/seed/index.ts`.
 */
export const standardizationRolesStep: SeedStep = {
  name: 'standardization-roles',
  async run(payload) {
    // 0. Resolve each standardization menuKey → its adminMenus id (integers here).
    const menuIdByKey = new Map<string, number>()
    for (const key of STANDARDIZATION_MENU_KEYS) {
      const found = await payload.find({
        collection: 'adminMenus',
        where: { menuKey: { equals: key } },
        limit: 1,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      const id = found.docs[0]?.id
      if (id === undefined) {
        throw new Error(
          `[seed:standardization-roles] menu "${key}" not found — "admin-menus" must seed first.`,
        )
      }
      menuIdByKey.set(key, id)
    }
    const desiredMenuIds = STANDARDIZATION_MENU_KEYS.map((k) => menuIdByKey.get(k)!)

    // 1. Seed / heal ROLE_DBA idempotently, granting all four menus.
    const existing = await payload.find({
      collection: 'roles',
      where: { roleId: { equals: ROLE_DBA } },
      limit: 1,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    let dbaRoleId: number
    const existingRole = existing.docs[0]
    if (existingRole) {
      dbaRoleId = existingRole.id
      const currentIds = (Array.isArray(existingRole.menuGrants) ? existingRole.menuGrants : [])
        .map(toRelationId)
        .filter((id): id is number => typeof id === 'number')
      const currentSet = new Set(currentIds)
      const missing = desiredMenuIds.filter((id) => !currentSet.has(id))
      if (missing.length > 0) {
        await payload.update({
          collection: 'roles',
          id: dbaRoleId,
          data: { menuGrants: [...currentIds, ...missing] },
          overrideAccess: true,
        })
        payload.logger.info(
          `[seed:standardization-roles] added ${missing.length} grant(s) to "${ROLE_DBA}".`,
        )
      } else {
        payload.logger.info(
          `[seed:standardization-roles] role "${ROLE_DBA}" already holds all grants — skipping.`,
        )
      }
    } else {
      const created = await payload.create({
        collection: 'roles',
        data: {
          roleId: ROLE_DBA,
          name: 'DBA (공공데이터 표준화 관리자)',
          description:
            'Database Administrator — manages the public-data standardization dictionaries (domain/word/term) and the code specification report (refs 1-60..1-65, 1-74).',
          isSuper: false,
          menuGrants: desiredMenuIds,
        },
        overrideAccess: true,
      })
      dbaRoleId = created.id
      payload.logger.info(`[seed:standardization-roles] created role "${ROLE_DBA}".`)
    }

    // 2. Assign ROLE_DBA to the seeded super-admin (additive heal).
    const email = process.env.SEED_ADMIN_EMAIL || DEFAULT_SEED_ADMIN_EMAIL
    const superFound = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const superAdmin = superFound.docs[0]
    if (superAdmin) {
      const currentRoleIds = (superAdmin.roles ?? [])
        .map(toRelationId)
        .filter((id): id is number => typeof id === 'number')
      if (!currentRoleIds.some((id) => id === dbaRoleId)) {
        await payload.update({
          collection: 'users',
          id: superAdmin.id,
          data: { roles: [...currentRoleIds, dbaRoleId] },
          overrideAccess: true,
        })
        payload.logger.info(
          `[seed:standardization-roles] assigned "${ROLE_DBA}" to super-admin "${email}".`,
        )
      } else {
        payload.logger.info(
          `[seed:standardization-roles] super-admin "${email}" already holds "${ROLE_DBA}" — skipping.`,
        )
      }
    }
  },
}
