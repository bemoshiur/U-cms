/**
 * Pure display-component helpers (Task 3C). No Payload runtime dependency, so
 * these are unit-testable in isolation (mirrors `src/content/wordFilter.ts`)
 * and reusable by the Phase-4 public frontend. Backs the notification-area,
 * popup, and banner collections (which share an exposure window + a use/active
 * toggle) and the admin-notice ordering.
 */

/** The shape the exposure-window + active toggle share across display collections. */
export type ExposureItem = {
  active?: boolean | null
  exposeFrom?: string | Date | null
  exposeTo?: string | Date | null
}

/** Coerces a Date | ISO string | null into epoch ms, or `undefined` when absent/invalid. */
function toEpoch(value: string | Date | null | undefined): number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * Whether a display item is "live" (should render) at `now`. The single source
 * of truth reused by the admin list + the Phase-4 frontend, so the rule lives
 * in exactly one tested place.
 *
 * Rule (ref 1-45/1-46/1-51/1-52 business rules):
 *  - `active === false` → never live (an inactive item stays in the admin list
 *    but is not exposed). `active` unset/true is treated as active.
 *  - Outside `[exposeFrom, exposeTo]` → not live. Bounds are INCLUSIVE (an item
 *    is live exactly at its start and end instant). An absent bound means "no
 *    lower / no upper bound". An unparseable date is ignored (treated as absent)
 *    rather than making the item silently disappear.
 */
export function isLive(item: ExposureItem, now: Date = new Date()): boolean {
  if (item.active === false) {
    return false
  }
  const t = now.getTime()
  const from = toEpoch(item.exposeFrom)
  if (from !== undefined && t < from) {
    return false
  }
  const to = toEpoch(item.exposeTo)
  if (to !== undefined && t > to) {
    return false
  }
  return true
}

/**
 * External-link URL predicate (ref 1-46/1-52/1-53: "external links must start
 * with http://"). Accepts both `http://` and `https://` (https is the secure
 * superset of the legacy rule). Used by the shared `linkExternal` field's
 * validator and reusable at render time.
 */
export function isHttpUrl(value: unknown): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}

/** The four exposure-order moves (노출순서 최상위/상위/하위/최하위). */
export type OrderMove = 'top' | 'up' | 'down' | 'bottom'

/**
 * Pure 4-way reorder of an ordered list (ref 1-45 callout 5, ref 1-51 callout
 * 6). Returns a NEW array with the item at `index` moved; the caller persists
 * the result as each row's `displayOrder` (= its new index). The drag/button
 * UI that calls this is deferred to Phase 4 — this is the underlying data move.
 * Out-of-range `index` is a no-op (returns a copy).
 */
export function reorder<T>(items: readonly T[], index: number, move: OrderMove): T[] {
  const next = items.slice()
  if (index < 0 || index >= next.length) {
    return next
  }
  const item = next.splice(index, 1)[0]
  if (item === undefined) {
    return next
  }
  switch (move) {
    case 'top':
      next.unshift(item)
      break
    case 'bottom':
      next.push(item)
      break
    case 'up':
      next.splice(Math.max(0, index - 1), 0, item)
      break
    case 'down':
      next.splice(Math.min(next.length, index + 1), 0, item)
      break
  }
  return next
}

/** The shape admin-notice ordering compares against (ref 1-49). */
export type AdminNoticeOrderItem = {
  noticeType?: string | null
  createdAt?: string | Date | null
}

/**
 * Comparator that sorts pinned (`공지`) notices above general ones, then newest
 * first within each group (ref 1-49: "notices flagged as 공지 are pinned at the
 * top of the list above numbered general posts"). Pure, so the ordering is
 * unit-tested independently of the DB.
 */
export function compareAdminNotices(a: AdminNoticeOrderItem, b: AdminNoticeOrderItem): number {
  const aPinned = a.noticeType === 'pinned' ? 0 : 1
  const bPinned = b.noticeType === 'pinned' ? 0 : 1
  if (aPinned !== bPinned) {
    return aPinned - bPinned
  }
  const aTime = toEpoch(a.createdAt) ?? 0
  const bTime = toEpoch(b.createdAt) ?? 0
  return bTime - aTime
}
