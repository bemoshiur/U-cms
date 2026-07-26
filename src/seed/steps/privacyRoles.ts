import { randomBytes } from 'crypto'

import { toRelationId } from '../../collections/utils'
import { validatePassword } from '../../auth/validatePassword'
import {
  PRIVACY_ORG_MENU_KEY,
  PRIVACY_ROLE_DEPUTY,
  PRIVACY_ROLE_OFFICER,
  PRIVACY_ROLE_STAFF,
  PRIVACY_ROLE_TEAM,
} from '../../privacy/orgChart'
import type { SeedStep } from '../types'
import { DEFAULT_SEED_ADMIN_EMAIL } from './superAdmin'

/**
 * Privacy-org roles + example assignments (Task 6C Part 2; legacy ref 3-10). The
 * four tiers of the privacy governance hierarchy are modeled as dedicated
 * `ROLE_` ids (the concrete realization of the plan §2.2 "privacy-processor"
 * role concept). This step:
 *
 *  1. Seeds the four privacy roles idempotently, each granting `privacy.orgChart`
 *     (this task owns that menu). Task 6D adds the other §3 privacy menu grants
 *     onto these roles — see task-6C-report.md.
 *  2. Assigns `ROLE_PRIVACY_OFFICER` to the seeded super-admin (additive heal) so
 *     the org chart renders non-empty out of the box against a real account.
 *  3. Creates four example privacy-org admins (deputy / team / two staff) with a
 *     department + duty so the full four-tier chart renders. These are DEMO
 *     accounts: each is created with a RANDOM, unknown, unrecoverable password
 *     (so it is NOT login-capable — safer than the known-password demo member)
 *     and holds ONLY its single privacy role (which grants only the read-only
 *     org-chart view). Operators may delete them.
 *
 * Must run AFTER `adminMenusStep` (needs the `privacy.orgChart` menu),
 * `rolesStep`/`superAdminStep` (the super-admin must exist to be assigned), and
 * `departmentsStep` (example admins reference seeded departments) — see the
 * registration order in `src/seed/index.ts`.
 */

const PRIVACY_ROLE_SEEDS: { roleId: string; name: string; description: string }[] = [
  {
    roleId: PRIVACY_ROLE_OFFICER,
    name: '개인정보 책임자 (Chief Privacy Officer)',
    description: 'Privacy-org tier 1 (ref 3-10). Grants access to the privacy organization chart.',
  },
  {
    roleId: PRIVACY_ROLE_DEPUTY,
    name: '개인정보 부책임자 (Deputy Privacy Officer)',
    description: 'Privacy-org tier 2 (ref 3-10). Grants access to the privacy organization chart.',
  },
  {
    roleId: PRIVACY_ROLE_TEAM,
    name: '개인정보 보호팀 (Privacy Protection Team)',
    description: 'Privacy-org tier 3 (ref 3-10). Grants access to the privacy organization chart.',
  },
  {
    roleId: PRIVACY_ROLE_STAFF,
    name: '개인정보 담당자 (Privacy Staff)',
    description: 'Privacy-org tier 4 (ref 3-10). Grants access to the privacy organization chart.',
  },
]

const EXAMPLE_PRIVACY_ADMINS: {
  loginId: string
  email: string
  name: string
  roleId: string
  departmentName: string
  duties: string
}[] = [
  {
    loginId: 'privacy-deputy',
    email: 'privacy-deputy@example.invalid',
    name: 'Privacy Deputy (example)',
    roleId: PRIVACY_ROLE_DEPUTY,
    departmentName: 'Management Support',
    duties: '개인정보 보호 관리 (Privacy protection management)',
  },
  {
    loginId: 'privacy-team',
    email: 'privacy-team@example.invalid',
    name: 'Privacy Team Lead (example)',
    roleId: PRIVACY_ROLE_TEAM,
    departmentName: 'Management Support',
    duties: '개인정보 보호팀 운영 (Protection team operations)',
  },
  {
    loginId: 'privacy-staff-1',
    email: 'privacy-staff-1@example.invalid',
    name: 'Privacy Staff A (example)',
    roleId: PRIVACY_ROLE_STAFF,
    departmentName: 'Development',
    duties: '관리적 보호조치 (Administrative safeguards)',
  },
  {
    loginId: 'privacy-staff-2',
    email: 'privacy-staff-2@example.invalid',
    name: 'Privacy Staff B (example)',
    roleId: PRIVACY_ROLE_STAFF,
    departmentName: 'Development',
    duties: '기술적 보호조치 (Technical safeguards)',
  },
]

/**
 * Generates a random password that satisfies the code-enforced policy
 * (`validatePassword`, ref 3-9) so the create passes the `beforeValidate` gate.
 * It is never logged or returned, so these demo accounts are effectively not
 * login-capable. Retries on the rare chance the random core contains a rejected
 * sequence.
 */
function generateCompliantPassword(loginId: string): string {
  for (let i = 0; i < 50; i++) {
    const core = randomBytes(15)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
    const candidate = `Pz${core}#7q`
    if (validatePassword(candidate, { userId: loginId }) === true) {
      return candidate
    }
  }
  throw new Error('[seed:privacy-roles] could not generate a compliant demo password')
}

export const privacyRolesStep: SeedStep = {
  name: 'privacy-roles',
  async run(payload) {
    // 0. Resolve the privacy.orgChart menu id (every privacy role grants it).
    const orgMenu = await payload.find({
      collection: 'adminMenus',
      where: { menuKey: { equals: PRIVACY_ORG_MENU_KEY } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const orgMenuId = orgMenu.docs[0]?.id
    if (orgMenuId === undefined) {
      throw new Error(
        `[seed:privacy-roles] menu "${PRIVACY_ORG_MENU_KEY}" not found — the "admin-menus" seed step must run first.`,
      )
    }

    // 1. Seed the four privacy roles idempotently. (Postgres ids are integers in
    // this project — no UUID adapter — so the map values are always numbers.)
    const roleIdToDbId = new Map<string, number>()
    for (const seed of PRIVACY_ROLE_SEEDS) {
      const existing = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: seed.roleId } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const existingDoc = existing.docs[0]
      if (existingDoc) {
        roleIdToDbId.set(seed.roleId, existingDoc.id)
        payload.logger.info(`[seed:privacy-roles] role "${seed.roleId}" already exists — skipping.`)
        continue
      }
      const created = await payload.create({
        collection: 'roles',
        data: {
          roleId: seed.roleId,
          name: seed.name,
          description: seed.description,
          isSuper: false,
          menuGrants: [orgMenuId],
        },
        overrideAccess: true,
      })
      roleIdToDbId.set(seed.roleId, created.id)
      payload.logger.info(`[seed:privacy-roles] created role "${seed.roleId}".`)
    }

    // 2. Assign ROLE_PRIVACY_OFFICER to the seeded super-admin (additive heal).
    const officerDbId = roleIdToDbId.get(PRIVACY_ROLE_OFFICER)
    const email = process.env.SEED_ADMIN_EMAIL || DEFAULT_SEED_ADMIN_EMAIL
    const superFound = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const superAdmin = superFound.docs[0]
    if (superAdmin && officerDbId !== undefined) {
      const currentRoleIds = (superAdmin.roles ?? [])
        .map(toRelationId)
        .filter((id): id is number => typeof id === 'number')
      if (!currentRoleIds.some((id) => id === officerDbId)) {
        await payload.update({
          collection: 'users',
          id: superAdmin.id,
          data: { roles: [...currentRoleIds, officerDbId] },
          overrideAccess: true,
        })
        payload.logger.info(
          `[seed:privacy-roles] assigned "${PRIVACY_ROLE_OFFICER}" to super-admin "${email}".`,
        )
      } else {
        payload.logger.info(
          `[seed:privacy-roles] super-admin "${email}" already holds "${PRIVACY_ROLE_OFFICER}" — skipping.`,
        )
      }
    }

    // 3. Create the example privacy-org admins (idempotent by loginId).
    for (const admin of EXAMPLE_PRIVACY_ADMINS) {
      const existing = await payload.find({
        collection: 'users',
        where: { loginId: { equals: admin.loginId } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      if (existing.docs.length > 0) {
        payload.logger.info(
          `[seed:privacy-roles] admin "${admin.loginId}" already exists — skipping.`,
        )
        continue
      }

      const roleDbId = roleIdToDbId.get(admin.roleId)
      if (roleDbId === undefined) {
        continue
      }

      const dept = await payload.find({
        collection: 'departments',
        where: { name: { equals: admin.departmentName } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const departmentId = dept.docs[0]?.id

      await payload.create({
        collection: 'users',
        data: {
          email: admin.email,
          loginId: admin.loginId,
          name: admin.name,
          password: generateCompliantPassword(admin.loginId),
          status: 'active',
          roles: [roleDbId],
          duties: admin.duties,
          ...(departmentId !== undefined ? { department: departmentId } : {}),
        },
        overrideAccess: true,
      })
      payload.logger.info(`[seed:privacy-roles] created example admin "${admin.loginId}".`)
    }
  },
}
