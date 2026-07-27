import type { Payload } from 'payload'

import type { SeedStep } from '../../types'
import {
  DEFAULT_SEED_ADMIN_PASSWORD,
  assertSeedAdminPasswordSafeForProduction,
} from '../superAdmin'
import { RICH_ADMIN_ACCOUNTS, RICH_ROLES, adminMenuIdByKey, departmentIdByName } from './shared'

/**
 * A realistic government-portal organization tree (owner mandate: ~10-15 nodes
 * with duties/phones so the department picker + org chart look real). Layered
 * ON TOP of the minimal `departmentsStep` (Head Office → Management Support /
 * Development), adding four divisions each with two teams under the existing
 * Head Office root. Idempotent: every node is looked up by (name, parent).
 */

type DeptSeed = {
  name: string
  duties: string
  phone: string
  children?: DeptSeed[]
}

const RICH_DEPARTMENTS: DeptSeed[] = [
  {
    name: 'Planning & Coordination Division',
    duties: 'Policy planning, budgeting, and inter-department coordination.',
    phone: '02-3100-2000',
    children: [
      {
        name: 'Policy Planning Team',
        duties: 'Mid- and long-term policy planning and performance management.',
        phone: '02-3100-2010',
      },
      {
        name: 'Budget & Finance Team',
        duties: 'Budget formulation, execution, and accounting.',
        phone: '02-3100-2020',
      },
    ],
  },
  {
    name: 'Public Relations Division',
    duties: 'Public relations, press releases, and digital communications.',
    phone: '02-3100-3000',
    children: [
      {
        name: 'Media Relations Team',
        duties: 'Press releases, media enquiries, and spokesperson support.',
        phone: '02-3100-3010',
      },
      {
        name: 'Digital Communications Team',
        duties: 'Website, social channels, and online content operations.',
        phone: '02-3100-3020',
      },
    ],
  },
  {
    name: 'Administrative Services Division',
    duties: 'General affairs, human resources, and records management.',
    phone: '02-3100-4000',
    children: [
      {
        name: 'General Affairs Team',
        duties: 'Facilities, procurement, and document management.',
        phone: '02-3100-4010',
      },
      {
        name: 'Human Resources Team',
        duties: 'Recruitment, personnel records, and training.',
        phone: '02-3100-4020',
      },
    ],
  },
  {
    name: 'Information & Technology Division',
    duties: 'Systems operation, security, and data & statistics.',
    phone: '02-3100-5000',
    children: [
      {
        name: 'Systems Operations Team',
        duties: 'Infrastructure operation, service availability, and support.',
        phone: '02-3100-5010',
      },
      {
        name: 'Data & Statistics Team',
        duties: 'Data governance, statistics, and open-data publishing.',
        phone: '02-3100-5020',
      },
    ],
  },
]

async function ensureDepartment(
  payload: Payload,
  node: DeptSeed,
  parentId: number | undefined,
  order: number,
): Promise<number> {
  const parentClause =
    parentId === undefined ? { parent: { exists: false } } : { parent: { equals: parentId } }
  const existing = await payload.find({
    collection: 'departments',
    where: { and: [{ name: { equals: node.name } }, parentClause] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const found = existing.docs[0]
  if (found) {
    return found.id
  }
  const created = await payload.create({
    collection: 'departments',
    data: {
      name: node.name,
      duties: node.duties,
      phone: node.phone,
      order,
      ...(parentId !== undefined ? { parent: parentId } : {}),
    },
    overrideAccess: true,
  })
  payload.logger.info(`[seed:rich-org] created department "${node.name}".`)
  return created.id
}

export const richOrgTreeStep: SeedStep = {
  name: 'rich-org-tree',
  async run(payload: Payload) {
    // The Head Office root is created by the minimal departmentsStep.
    const root = await payload.find({
      collection: 'departments',
      where: { and: [{ name: { equals: 'Head Office' } }, { parent: { exists: false } }] },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const rootId = root.docs[0]?.id
    if (rootId === undefined) {
      throw new Error('[seed:rich-org] Head Office root not found — did departmentsStep run first?')
    }

    for (const [i, division] of RICH_DEPARTMENTS.entries()) {
      const divisionId = await ensureDepartment(payload, division, rootId, i + 10)
      for (const [j, team] of (division.children ?? []).entries()) {
        await ensureDepartment(payload, team, divisionId, j)
      }
    }
  },
}

/**
 * Extra classification / groups / detail codes so Code Management looks
 * populated (owner mandate), including a depth-2 hierarchy to exercise the
 * concatenated-2-digit-per-depth rule. Layered on top of the baseline `SYS`
 * classification from `codesStep`; idempotent at every level.
 */
const SVC_CLASSIFICATION = {
  code: 'SVC',
  name: 'Service codes',
  description:
    'Demo service-level codes for the public site (content categories, department types). Layered on top of the baseline SYS codes.',
}

type CodeSeed = { code: string; name: string; children?: CodeSeed[] }

const SVC_GROUPS: { codeId: string; name: string; description: string; codes: CodeSeed[] }[] = [
  {
    codeId: 'CNTNT_CTGRY_CD',
    name: 'Content category',
    description: 'Content classification used across boards and web content.',
    codes: [
      { code: '01', name: 'Notice' },
      { code: '02', name: 'News' },
      { code: '03', name: 'Event' },
      {
        code: '04',
        name: 'Policy',
        // Depth-2 children (must start with the parent code, 4 digits).
        children: [
          { code: '0401', name: 'National policy' },
          { code: '0402', name: 'Local policy' },
        ],
      },
    ],
  },
  {
    codeId: 'DEPT_TYPE_CD',
    name: 'Department type',
    description: 'Organizational unit type.',
    codes: [
      { code: '01', name: 'Division' },
      { code: '02', name: 'Team' },
      { code: '03', name: 'Office' },
    ],
  },
]

async function ensureCode(
  payload: Payload,
  groupId: number,
  def: CodeSeed,
  parentId: number | undefined,
  order: number,
): Promise<void> {
  const existing = await payload.find({
    collection: 'codes',
    where: { and: [{ group: { equals: groupId } }, { code: { equals: def.code } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  let id = existing.docs[0]?.id
  if (id === undefined) {
    const created = await payload.create({
      collection: 'codes',
      data: {
        group: groupId,
        code: def.code,
        name: def.name,
        order,
        ...(parentId !== undefined ? { parent: parentId } : {}),
      },
      overrideAccess: true,
    })
    id = created.id
    payload.logger.info(`[seed:rich-codes] created code "${def.code}" (${def.name}).`)
  }
  for (const [i, child] of (def.children ?? []).entries()) {
    await ensureCode(payload, groupId, child, id, i)
  }
}

export const richCodesStep: SeedStep = {
  name: 'rich-codes',
  async run(payload: Payload) {
    let classification = (
      await payload.find({
        collection: 'codeClassifications',
        where: { code: { equals: SVC_CLASSIFICATION.code } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
    ).docs[0]
    if (!classification) {
      classification = await payload.create({
        collection: 'codeClassifications',
        data: SVC_CLASSIFICATION,
        overrideAccess: true,
      })
      payload.logger.info(`[seed:rich-codes] created classification "${SVC_CLASSIFICATION.code}".`)
    }

    for (const group of SVC_GROUPS) {
      let groupDoc = (
        await payload.find({
          collection: 'codeGroups',
          where: { codeId: { equals: group.codeId } },
          limit: 1,
          pagination: false,
          overrideAccess: true,
        })
      ).docs[0]
      if (!groupDoc) {
        groupDoc = await payload.create({
          collection: 'codeGroups',
          data: {
            codeId: group.codeId,
            name: group.name,
            description: group.description,
            classification: classification.id,
          },
          overrideAccess: true,
        })
        payload.logger.info(`[seed:rich-codes] created code group "${group.codeId}".`)
      }
      for (const [i, code] of group.codes.entries()) {
        await ensureCode(payload, groupDoc.id, code, undefined, i)
      }
    }
  },
}

/**
 * The extra admin roles + login-capable admin accounts (owner mandate: ~6-8
 * admins across roles). Creates two non-super roles (Content Editor, Statistics
 * Analyst) with real menu grants, then four active admins with names /
 * departments / duties / phones. All share the super-admin password source
 * (`SEED_ADMIN_PASSWORD`); the production fail-fast is enforced on the create
 * path so a public deploy never gets a KNOWN default password. Idempotent by
 * roleId / loginId. Runs after roles / privacy-roles / departments.
 */
export const richAdminsStep: SeedStep = {
  name: 'rich-admins',
  async run(payload: Payload) {
    // 1) Roles — idempotent by roleId; resolve menuGrants from permanent keys.
    const roleDbIdByRoleId = new Map<string, number>()
    for (const role of RICH_ROLES) {
      const existing = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: role.roleId } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      if (existing.docs[0]) {
        roleDbIdByRoleId.set(role.roleId, existing.docs[0].id)
        continue
      }
      const grants: number[] = []
      for (const key of role.menuKeys) {
        const id = await adminMenuIdByKey(payload, key)
        if (id !== undefined) {
          grants.push(id)
        }
      }
      const created = await payload.create({
        collection: 'roles',
        data: {
          roleId: role.roleId,
          name: role.name,
          description: role.description,
          isSuper: false,
          menuGrants: grants,
        },
        overrideAccess: true,
      })
      roleDbIdByRoleId.set(role.roleId, created.id)
      payload.logger.info(`[seed:rich-admins] created role "${role.roleId}".`)
    }

    // 2) Admin accounts — idempotent by loginId.
    const usingDefaultPassword = !process.env.SEED_ADMIN_PASSWORD
    const password = process.env.SEED_ADMIN_PASSWORD || DEFAULT_SEED_ADMIN_PASSWORD
    let warnedDefault = false

    for (const admin of RICH_ADMIN_ACCOUNTS) {
      const existing = await payload.find({
        collection: 'users',
        where: { loginId: { equals: admin.loginId } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      if (existing.docs.length > 0) {
        payload.logger.info(
          `[seed:rich-admins] admin "${admin.loginId}" already exists — skipping.`,
        )
        continue
      }

      // Resolve the role db id: either a role this step seeded, or a
      // pre-existing role (e.g. ROLE_PRIVACY_OFFICER from privacyRolesStep).
      let roleDbId = roleDbIdByRoleId.get(admin.roleId)
      if (roleDbId === undefined) {
        const found = await payload.find({
          collection: 'roles',
          where: { roleId: { equals: admin.roleId } },
          limit: 1,
          pagination: false,
          overrideAccess: true,
        })
        roleDbId = found.docs[0]?.id
      }

      if (usingDefaultPassword) {
        // Hard fail-fast in production; loud warning in dev/test. Only on create.
        assertSeedAdminPasswordSafeForProduction()
        if (!warnedDefault) {
          payload.logger.warn(
            '[seed:rich-admins] SEED_ADMIN_PASSWORD is not set — seeding demo admins with the ' +
              'development-only default password. Not safe outside local dev.',
          )
          warnedDefault = true
        }
      }

      const departmentId = await departmentIdByName(payload, admin.departmentName)

      await payload.create({
        collection: 'users',
        data: {
          email: admin.email,
          loginId: admin.loginId,
          name: admin.name,
          password,
          status: 'active',
          duties: admin.duties,
          mobile: admin.mobile,
          extension: admin.extension,
          ...(roleDbId !== undefined ? { roles: [roleDbId] } : {}),
          ...(departmentId !== undefined ? { department: departmentId } : {}),
        },
        overrideAccess: true,
      })
      payload.logger.info(`[seed:rich-admins] created admin "${admin.loginId}" (${admin.roleId}).`)
    }
  },
}
