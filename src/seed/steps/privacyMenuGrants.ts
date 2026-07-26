import { toRelationId } from '../../collections/utils'
import { SECURITY_DOCS_MENU_KEY } from '../../access/securityDocs'
import { PASSWORD_POLICY_MENU_KEY } from '../../privacy/passwordPolicyData'
import {
  PRIVACY_ORG_MENU_KEY,
  PRIVACY_ROLE_DEPUTY,
  PRIVACY_ROLE_OFFICER,
  PRIVACY_ROLE_STAFF,
  PRIVACY_ROLE_TEAM,
} from '../../privacy/orgChart'
import { PERSONAL_INFO_LOGS_MENU_KEY } from '../../endpoints/personalInfoLogsExport'
import type { SeedStep } from '../types'

/**
 * §3 Privacy menu grants (Task 6D; TODO 6.8, plan §2.2). T6C seeded the four
 * privacy roles (`ROLE_PRIVACY_OFFICER/DEPUTY/TEAM/STAFF`) each granting ONLY
 * `privacy.orgChart`; the role seed is skip-if-exists, so extending those roles'
 * grants to the rest of the Privacy Protection System is THIS task's step (per
 * task-6C-report.md "For Task 6D"). It runs AFTER `privacyRolesStep` and
 * `securityDocsStep` (needs the roles + every §3 adminMenu to exist).
 *
 * Additive + idempotent: the desired grants are UNIONed onto whatever the role
 * already holds (an operator's later hand-edits are never removed), and the role
 * is only updated when a grant is actually missing. This is what makes the
 * seeded privacy officer (and the demo privacy-org admins) see the §3 subsystem
 * out of the box — a general content admin, holding none of these, sees none of
 * it (server-side `hasMenuAccess`, not just nav-hidden).
 *
 * Grant tiers (책임자 → 부책임자 → 보호팀 → 담당자):
 *  - OFFICER / DEPUTY — the FULL §3 surface: access/login/permission/menu-perm
 *    histories, personal-info access history (+ its unmasked export), the
 *    security-document libraries, the org chart, and password-policy management.
 *  - TEAM — the audit histories + security documents + org chart, but NOT the
 *    most-sensitive personal-info access history nor password-policy management.
 *  - STAFF — the general access/login histories + security documents + org
 *    chart (the day-to-day read surface), nothing more.
 */

/** Every §3 audit/history menuKey (permissionLogs gates BOTH permission journals). */
const ACCESS_LOGS = 'privacy.accessLogs'
const LOGIN_HISTORY = 'privacy.loginHistory'
const PERMISSION_LOGS = 'privacy.permissionLogs'

const OFFICER_GRANTS: readonly string[] = [
  ACCESS_LOGS,
  LOGIN_HISTORY,
  PERMISSION_LOGS,
  PERSONAL_INFO_LOGS_MENU_KEY,
  SECURITY_DOCS_MENU_KEY,
  PRIVACY_ORG_MENU_KEY,
  PASSWORD_POLICY_MENU_KEY,
]

const GRANTS_BY_ROLE: Record<string, readonly string[]> = {
  [PRIVACY_ROLE_OFFICER]: OFFICER_GRANTS,
  [PRIVACY_ROLE_DEPUTY]: OFFICER_GRANTS,
  [PRIVACY_ROLE_TEAM]: [
    ACCESS_LOGS,
    LOGIN_HISTORY,
    PERMISSION_LOGS,
    SECURITY_DOCS_MENU_KEY,
    PRIVACY_ORG_MENU_KEY,
  ],
  [PRIVACY_ROLE_STAFF]: [ACCESS_LOGS, LOGIN_HISTORY, SECURITY_DOCS_MENU_KEY, PRIVACY_ORG_MENU_KEY],
}

export const privacyMenuGrantsStep: SeedStep = {
  name: 'privacy-menu-grants',
  async run(payload) {
    // Resolve every menuKey we might grant → its adminMenus id (integers here).
    const allKeys = Array.from(new Set(Object.values(GRANTS_BY_ROLE).flat()))
    const menuIdByKey = new Map<string, number>()
    for (const key of allKeys) {
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
          `[seed:privacy-menu-grants] menu "${key}" not found — "admin-menus" must seed first.`,
        )
      }
      menuIdByKey.set(key, id)
    }

    for (const [roleId, keys] of Object.entries(GRANTS_BY_ROLE)) {
      const found = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: roleId } },
        limit: 1,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      const role = found.docs[0]
      if (!role) {
        payload.logger.info(
          `[seed:privacy-menu-grants] role "${roleId}" not found — did privacyRolesStep run? Skipping.`,
        )
        continue
      }

      const currentIds = (Array.isArray(role.menuGrants) ? role.menuGrants : [])
        .map(toRelationId)
        .filter((id): id is number => typeof id === 'number')
      const currentSet = new Set(currentIds)

      const desiredIds = keys.map((k) => menuIdByKey.get(k)!).filter((id) => id !== undefined)
      const missing = desiredIds.filter((id) => !currentSet.has(id))

      if (missing.length === 0) {
        payload.logger.info(
          `[seed:privacy-menu-grants] role "${roleId}" already holds all §3 grants — skipping.`,
        )
        continue
      }

      await payload.update({
        collection: 'roles',
        id: role.id,
        data: { menuGrants: [...currentIds, ...missing] },
        overrideAccess: true,
      })
      payload.logger.info(
        `[seed:privacy-menu-grants] added ${missing.length} §3 grant(s) to role "${roleId}".`,
      )
    }
  },
}
