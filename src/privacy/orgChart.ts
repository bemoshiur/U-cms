import type { Payload } from 'payload'

/**
 * Auto-generated privacy organization chart (Task 6C Part 2; legacy ref 3-10
 * 개인정보 조직도). A READ-ONLY view that composes the privacy-governance
 * hierarchy FROM ROLE ASSIGNMENTS — it is derived, never hand-drawn: adding or
 * removing an admin from a privacy role re-derives the chart on the next render
 * (proven by the pure `buildPrivacyOrgChart` helper's re-derivation test).
 *
 * ## The privacy role set (the exact ROLE_ ids — DOCUMENTED for Task 6D)
 *
 * Ref 3-10's hierarchy is 책임자 (officer) → 부책임자 (deputy) → 보호팀 (team) →
 * N×담당자 (staff). We model each tier as a dedicated `ROLE_` id (seeded
 * idempotently by `privacyRolesStep`):
 *
 *  - `ROLE_PRIVACY_OFFICER` — 개인정보 책임자 (Chief Privacy Officer), tier 1
 *  - `ROLE_PRIVACY_DEPUTY`  — 개인정보 부책임자 (Deputy Privacy Officer), tier 2
 *  - `ROLE_PRIVACY_TEAM`    — 개인정보 보호팀 (Privacy Protection Team), tier 3
 *  - `ROLE_PRIVACY_STAFF`   — 개인정보 담당자 (Privacy Staff), tier 4
 *
 * These are the concrete realization of the plan §2.2 "privacy-processor" role
 * concept — the dedicated privacy roles that gate the Privacy subsystem. This
 * task seeds them WITH the `privacy.orgChart` grant (it owns that menu). Task
 * 6D wires the other §3 privacy menu grants (privacy.accessLogs,
 * privacy.loginHistory, privacy.permissionLogs, privacy.personalInfoLogs) onto
 * the appropriate tiers — see task-6C-report.md.
 *
 * ## Privacy note
 *
 * The chart shows ADMIN org data only — name, department, and duty label — which
 * is organizational information, NOT member PII, so no masking applies (member
 * PII never appears here). Login IDs / emails are deliberately NOT rendered.
 */

export const PRIVACY_ORG_MENU_KEY = 'privacy.orgChart'

/** roleIds of the four privacy-org tiers (see `privacyRolesStep`). */
export const PRIVACY_ROLE_OFFICER = 'ROLE_PRIVACY_OFFICER'
export const PRIVACY_ROLE_DEPUTY = 'ROLE_PRIVACY_DEPUTY'
export const PRIVACY_ROLE_TEAM = 'ROLE_PRIVACY_TEAM'
export const PRIVACY_ROLE_STAFF = 'ROLE_PRIVACY_STAFF'

export type PrivacyTierDef = {
  tier: 1 | 2 | 3 | 4
  roleId: string
  /** Korean node title (legacy ref 3-10 labels). */
  titleKo: string
  /** English node title. */
  titleEn: string
  /** Default duty-classification label when an admin has no own `duties`. */
  defaultDuty: string
}

/**
 * The four tiers, top → bottom. Order is load-bearing: the view renders them in
 * this order as a vertical hierarchy (officer at the top, staff at the bottom).
 */
export const PRIVACY_TIERS: readonly PrivacyTierDef[] = [
  {
    tier: 1,
    roleId: PRIVACY_ROLE_OFFICER,
    titleKo: '개인정보 책임자',
    titleEn: 'Chief Privacy Officer',
    defaultDuty: '개인정보 보호 총괄 (Overall privacy governance)',
  },
  {
    tier: 2,
    roleId: PRIVACY_ROLE_DEPUTY,
    titleKo: '개인정보 부책임자',
    titleEn: 'Deputy Privacy Officer',
    defaultDuty: '개인정보 보호 관리 (Privacy protection management)',
  },
  {
    tier: 3,
    roleId: PRIVACY_ROLE_TEAM,
    titleKo: '개인정보 보호팀',
    titleEn: 'Privacy Protection Team',
    defaultDuty: '개인정보 보호팀 운영 (Protection team operations)',
  },
  {
    tier: 4,
    roleId: PRIVACY_ROLE_STAFF,
    titleKo: '개인정보 담당자',
    titleEn: 'Privacy Staff',
    defaultDuty: '관리적 보호조치 (Administrative safeguards)',
  },
]

/** All four privacy roleIds, in tier order. */
export const PRIVACY_ROLE_IDS: readonly string[] = PRIVACY_TIERS.map((t) => t.roleId)

/** A normalized admin, ready for the pure derivation (no DB / Payload coupling). */
export type OrgChartAdmin = {
  id: number | string
  name?: string | null
  /** Display department name (resolved from the populated `department` relation). */
  departmentName?: string | null
  /** The admin's own duties text (legacy 업무내용), overrides the tier default duty. */
  duties?: string | null
  /** The `ROLE_` ids this admin holds (privacy roles among them place them in tiers). */
  roleIds: string[]
}

/** One person shown inside a tier node. */
export type OrgMember = {
  id: number | string
  name: string
  department: string | null
  duty: string
}

/** One tier of the derived chart (always present, even when empty). */
export type OrgTier = {
  tier: 1 | 2 | 3 | 4
  roleId: string
  titleKo: string
  titleEn: string
  members: OrgMember[]
}

/** The chart is always exactly the four tiers, officer → deputy → team → staff. */
export type PrivacyOrgChart = [OrgTier, OrgTier, OrgTier, OrgTier]

/**
 * Derives the privacy org chart from admin role assignments. PURE — no DB, no
 * Payload — so it is exhaustively unit-testable and re-derives deterministically
 * whenever the input assignments change.
 *
 * Every tier is always present in the output (empty tiers included, rendered as
 * "unassigned" placeholders by the view). An admin holding several privacy
 * roles appears in EACH tier they hold (mirrors legacy, where one person can be
 * both e.g. officer and staff). Each member's duty label is their own `duties`
 * when set, else the tier's `defaultDuty` (ref 3-10 staff carry an
 * administrative-safeguards duty classification).
 */
export function buildPrivacyOrgChart(admins: OrgChartAdmin[]): PrivacyOrgChart {
  const tiers = PRIVACY_TIERS.map((tierDef) => {
    const members: OrgMember[] = admins
      .filter((a) => a.roleIds.includes(tierDef.roleId))
      .map((a) => ({
        id: a.id,
        name: a.name?.trim() || `(admin #${a.id})`,
        department: a.departmentName?.trim() || null,
        duty: a.duties?.trim() || tierDef.defaultDuty,
      }))
    return {
      tier: tierDef.tier,
      roleId: tierDef.roleId,
      titleKo: tierDef.titleKo,
      titleEn: tierDef.titleEn,
      members,
    }
  })
  // PRIVACY_TIERS is a fixed 4-element list, so the chart is always a 4-tuple.
  return tiers as PrivacyOrgChart
}

/** Extracts the `roleId` strings from a user's populated (or id-only) `roles`. */
function extractRoleIds(rolesValue: unknown): string[] {
  if (!Array.isArray(rolesValue)) {
    return []
  }
  const ids: string[] = []
  for (const r of rolesValue) {
    if (r && typeof r === 'object' && typeof (r as { roleId?: unknown }).roleId === 'string') {
      ids.push((r as { roleId: string }).roleId)
    }
  }
  return ids
}

/** Resolves a populated department relation to its display name, if present. */
function extractDepartmentName(departmentValue: unknown): string | null {
  if (
    departmentValue &&
    typeof departmentValue === 'object' &&
    typeof (departmentValue as { name?: unknown }).name === 'string'
  ) {
    return (departmentValue as { name: string }).name
  }
  return null
}

/**
 * Loads + derives the privacy org chart from the live `users` + `roles` data.
 * Reads with `overrideAccess: true` because the view's own
 * `hasMenuAccess(privacy.orgChart)` gate already authorized the caller.
 *
 * Resolves the four privacy roles' DB ids, then fetches every admin holding any
 * of them (depth 1 so `roles` arrive as populated docs carrying `roleId`, and
 * `department` as a populated doc carrying `name`), normalizes them, and calls
 * the pure `buildPrivacyOrgChart`. Returns all four tiers (empty ones included).
 */
export async function loadPrivacyOrgChart(payload: Payload): Promise<PrivacyOrgChart> {
  const roleDocs = await payload.find({
    collection: 'roles',
    where: { roleId: { in: [...PRIVACY_ROLE_IDS] } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const roleDbIds = roleDocs.docs
    .map((r) => (r as { id: number | string }).id)
    .filter((id): id is number | string => id !== undefined && id !== null)

  if (roleDbIds.length === 0) {
    // Roles not seeded yet → every tier empty (view renders placeholders).
    return buildPrivacyOrgChart([])
  }

  const admins = await payload.find({
    collection: 'users',
    where: { roles: { in: roleDbIds } },
    pagination: false,
    depth: 1,
    overrideAccess: true,
  })

  const normalized: OrgChartAdmin[] = admins.docs.map((u) => {
    const user = u as unknown as Record<string, unknown>
    return {
      id: user.id as number | string,
      name: typeof user.name === 'string' ? user.name : null,
      departmentName: extractDepartmentName(user.department),
      duties: typeof user.duties === 'string' ? user.duties : null,
      roleIds: extractRoleIds(user.roles),
    }
  })

  return buildPrivacyOrgChart(normalized)
}
