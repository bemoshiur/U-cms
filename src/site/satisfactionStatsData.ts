import type { Payload, PayloadRequest } from 'payload'

import { toRelationId } from '../collections/utils'
import { averageScore, satisfactionPercent } from '../content/satisfaction'
import {
  byMenu as byMenuAgg,
  type MenuAggregate,
  type RatingRow,
  ratingTotal,
  scoreDistribution,
  type ScoreBucket,
  weightedAverage,
} from '../content/satisfactionStats'

/**
 * Shared read-side for the satisfaction statistics (Task 5B; TODO 5.4, ref
 * 2-19). Loads a site's `satisfactionRatings` and its menus (with each menu's
 * owning department, via the menu's `personInCharge`), then assembles the
 * distribution + weighted-average + per-menu payload the admin view renders and
 * the CSV export serializes, applying the DEPARTMENT → MENU cascading filters.
 * Single source of truth so the view and CSV never diverge.
 *
 * ## Tenant scoping
 *
 * Ratings are read under the caller's OWN access (`overrideAccess: false`) — the
 * `satisfactionRatings` collection is gated on the SAME `statistics.satisfaction`
 * key as the view/export, so its `tenantScopedMenuAccess` filters cross-tenant
 * rows out automatically (an unassigned site → empty). The server-rendered view
 * passes `overrideAccess: true` because its own gate already authorized the
 * caller + constrained the site list to their tenants. Menus are read with
 * `overrideAccess` (labels/departments only — no rating data).
 */

/** A menu option in the cascade, carrying its owning department (if any). */
export type MenuOption = {
  id: string | number
  name: string
  menuNumber: number | null
  departmentId: string | number | null
  departmentName: string | null
}

/** A department option in the cascade. */
export type DepartmentOption = { id: string | number; name: string }

/**
 * Loads a site's menus with their owning department. A menu "belongs to" a
 * department when its polymorphic `personInCharge` (담당자, ref 2-19) points to a
 * `departments` doc; depth 1 populates that doc so its name is available without
 * a second lookup. Menus with a user (or no) person-in-charge have a null dept.
 */
export async function loadSiteMenus(
  payload: Payload,
  tenantId: string | number,
  req?: PayloadRequest,
): Promise<MenuOption[]> {
  const found = await payload.find({
    collection: 'menus',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return (found.docs as unknown as Record<string, unknown>[]).map((m) => {
    const pic = m.personInCharge as { relationTo?: unknown; value?: unknown } | null | undefined
    let departmentId: string | number | null = null
    let departmentName: string | null = null
    if (pic && typeof pic === 'object' && pic.relationTo === 'departments') {
      departmentId = toRelationId(pic.value) ?? null
      const val = pic.value as { name?: unknown } | null | undefined
      departmentName =
        val && typeof val === 'object' && typeof val.name === 'string' ? val.name : null
    }
    return {
      id: m.id as string | number,
      name: typeof m.name === 'string' ? m.name : String(m.id ?? ''),
      menuNumber: typeof m.menuNumber === 'number' ? m.menuNumber : null,
      departmentId,
      departmentName,
    }
  })
}

/** Loads a site's satisfaction ratings as pure {@link RatingRow}s (score + menu id). */
export async function loadSatisfactionRatings(
  payload: Payload,
  args: {
    tenantId: string | number
    user?: unknown
    overrideAccess?: boolean
    req?: PayloadRequest
  },
): Promise<RatingRow[]> {
  const { tenantId, user, overrideAccess = false, req } = args
  const found = await payload.find({
    collection: 'satisfactionRatings',
    where: { tenant: { equals: tenantId } },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess,
    user: user as PayloadRequest['user'],
    req,
  })
  return (found.docs as unknown as Record<string, unknown>[]).map((r) => ({
    score: typeof r.score === 'number' ? r.score : null,
    menuId: toRelationId(r.menu) ?? null,
  }))
}

/** Distinct departments referenced by a site's menus (the cascade's top level). */
export function departmentsFromMenus(menus: MenuOption[]): DepartmentOption[] {
  const seen = new Map<string, DepartmentOption>()
  for (const m of menus) {
    if (m.departmentId !== null && m.departmentName !== null) {
      const key = String(m.departmentId)
      if (!seen.has(key)) {
        seen.set(key, { id: m.departmentId, name: m.departmentName })
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export type SatisfactionStatsPayload = {
  /** Cascade level 1 — all departments owning a menu on this site. */
  departments: DepartmentOption[]
  /** Cascade level 2 — menus, filtered to the selected department (or all). */
  menus: MenuOption[]
  selectedDepartment: string | number | null
  selectedMenu: string | number | null
  /** Totals over the filtered ratings. */
  count: number
  average: number | null
  percent: number | null
  weightedAverage: number | null
  /** Distribution table — count + % per score 1-5. */
  distribution: ScoreBucket[]
  /** Per-menu averages (the bars), with resolved menu names. */
  byMenu: (MenuAggregate & { menuName: string })[]
}

/**
 * Assembles the satisfaction-stats payload from ratings + menus, applying the
 * DEPARTMENT → MENU cascade: choosing a department narrows both the menu options
 * and the counted ratings to that department's menus; choosing a menu narrows to
 * that one menu. With neither chosen, every rating on the site is counted.
 */
export function buildSatisfactionStatsPayload(args: {
  ratings: RatingRow[]
  menus: MenuOption[]
  departmentId?: string | number | null
  menuId?: string | number | null
}): SatisfactionStatsPayload {
  const { ratings, menus } = args
  const departmentId = args.departmentId ?? null
  const menuId = args.menuId ?? null

  const departments = departmentsFromMenus(menus)
  const menusInDept =
    departmentId === null
      ? menus
      : menus.filter((m) => String(m.departmentId) === String(departmentId))

  // Which ratings are in scope, in cascade priority: a chosen menu wins; else a
  // chosen department (all its menus); else everything.
  const deptMenuIds = new Set(menusInDept.map((m) => String(m.id)))
  const filtered = ratings.filter((r) => {
    if (menuId !== null) {
      return r.menuId !== null && String(r.menuId) === String(menuId)
    }
    if (departmentId !== null) {
      return r.menuId !== null && deptMenuIds.has(String(r.menuId))
    }
    return true
  })

  const average = averageScore(filtered)
  const menuNameById = new Map(menus.map((m) => [String(m.id), m.name]))

  return {
    departments,
    menus: menusInDept,
    selectedDepartment: departmentId,
    selectedMenu: menuId,
    count: ratingTotal(filtered),
    average,
    percent: satisfactionPercent(average),
    weightedAverage: weightedAverage(filtered),
    distribution: scoreDistribution(filtered),
    byMenu: byMenuAgg(filtered).map((row) => ({
      ...row,
      menuName:
        row.menuId === null
          ? '(no menu)'
          : (menuNameById.get(String(row.menuId)) ?? String(row.menuId)),
    })),
  }
}
