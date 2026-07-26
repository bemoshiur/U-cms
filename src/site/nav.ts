/**
 * Pure public-site navigation helpers (Task 4A). No Payload runtime
 * dependency, so these are unit-testable in isolation (mirrors
 * `src/content/display.ts`) and shared by the RSC layout, breadcrumb, and
 * sitemap. The link-safety predicates (`isHttpUrl` / `isSafeInternalLink`) are
 * reused from `src/content/display.ts` — the SAME validators the collections
 * apply on write — so a value that somehow slipped past write validation still
 * cannot render as an unsafe `href` (belt-and-suspenders; Phase 4 renders
 * these as clickable links).
 *
 * Data model (refs 2-13 GNB/LNB, 1-9/3-11 depth/breadcrumb):
 *  - GNB = top-level (depth-1) active, visible menus.
 *  - LNB = the visible children (depth 2+) under the current section.
 *  - A menu's link target is derived from its `contentType` (link/board/content
 *    resolve to an href; placeholder/program are non-clickable section labels).
 */

import { isHttpUrl, isSafeInternalLink } from '../content/display'
import type { CurrentMember } from './member'

/** A relationship value as Payload returns it: a raw id or a populated doc. */
type RelValue = number | string | { id: number | string } | null | undefined

/**
 * The subset of a `menus` doc the nav layer reads. A structural type (not the
 * generated `Menu`) so callers can pass either a populated Payload doc or a
 * hand-built fixture, and so `board` can be the populated relation carrying the
 * `bbsId` we need for the board route.
 */
export type NavMenu = {
  id: number | string
  name: string
  menuNumber?: number | null
  parent?: RelValue
  order?: number | null
  contentType?: 'placeholder' | 'program' | 'board' | 'content' | 'link' | string | null
  board?: number | string | { id?: number | string; bbsId?: string | null } | null
  linkUrl?: string | null
  newWindow?: boolean | null
  active?: boolean | null
  exposureCondition?: 'always' | 'loggedInOnly' | 'loggedOutOnly' | string | null
}

/** A resolved menu/guide link target, or `none` for a non-clickable node. */
export type ResolvedLink =
  { kind: 'link'; href: string; external: boolean; newWindow: boolean } | { kind: 'none' }

/** A GNB/LNB tree node: the menu, its resolved link, and its visible children. */
export type NavNode = {
  menu: NavMenu
  link: ResolvedLink
  children: NavNode[]
}

/** Normalizes a relationship value to its id string, or `undefined` when absent. */
function relId(value: RelValue): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === 'object') {
    return value.id === undefined || value.id === null ? undefined : String(value.id)
  }
  return String(value)
}

/**
 * Whether a menu is visible to the given visitor. Two independent gates:
 *  - `active === false` → always hidden from the public nav (an inactive menu
 *    shows red in the admin tree — that is admin-only; ref: Menus.ts `active`).
 *  - `exposureCondition` vs session state (ref 2-13 노출조건): `loggedInOnly`
 *    needs a member, `loggedOutOnly` needs none, `always`/unset always shows.
 *    Member state comes from the T4B seam (`getCurrentMember`) — `null` today,
 *    so every visitor is treated as logged-out.
 */
export function isMenuVisible(menu: NavMenu, member: CurrentMember): boolean {
  if (menu.active === false) {
    return false
  }
  const condition = menu.exposureCondition ?? 'always'
  if (condition === 'loggedInOnly') {
    return member != null
  }
  if (condition === 'loggedOutOnly') {
    return member == null
  }
  return true
}

/**
 * Resolves a menu's clickable target from its `contentType` (ref 1-44/2-13):
 *  - `link`   → the stored `linkUrl`, re-validated (internal path or http(s));
 *               an invalid/blank value is non-clickable rather than an unsafe href.
 *  - `board`  → `/board/{bbsId}` (needs the populated board's `bbsId`).
 *  - `content`→ `/page/{menuNumber}` (the per-site menu number used in URLs).
 *  - `placeholder`/`program`/unknown → `none` (a non-clickable section label).
 *
 * `newWindow` is honored only for `link` menus (the field's legacy meaning —
 * 링크 방식: 새창); internal board/content routes always open in place.
 */
export function resolveMenuLink(menu: NavMenu): ResolvedLink {
  switch (menu.contentType) {
    case 'link': {
      const url = typeof menu.linkUrl === 'string' ? menu.linkUrl.trim() : ''
      if (isHttpUrl(url)) {
        return { kind: 'link', href: url, external: true, newWindow: Boolean(menu.newWindow) }
      }
      if (isSafeInternalLink(url)) {
        return { kind: 'link', href: url, external: false, newWindow: Boolean(menu.newWindow) }
      }
      return { kind: 'none' }
    }
    case 'board': {
      const bbsId = menu.board && typeof menu.board === 'object' ? menu.board.bbsId : undefined
      if (typeof bbsId === 'string' && bbsId.length > 0) {
        return { kind: 'link', href: `/board/${bbsId}`, external: false, newWindow: false }
      }
      return { kind: 'none' }
    }
    case 'content': {
      if (typeof menu.menuNumber === 'number' && Number.isFinite(menu.menuNumber)) {
        return { kind: 'link', href: `/page/${menu.menuNumber}`, external: false, newWindow: false }
      }
      return { kind: 'none' }
    }
    default:
      return { kind: 'none' }
  }
}

/** Sibling order: `order` asc, then `menuNumber` asc, then `name` (stable, deterministic). */
function compareMenus(a: NavMenu, b: NavMenu): number {
  const ao = a.order ?? 0
  const bo = b.order ?? 0
  if (ao !== bo) {
    return ao - bo
  }
  const an = a.menuNumber ?? Number.MAX_SAFE_INTEGER
  const bn = b.menuNumber ?? Number.MAX_SAFE_INTEGER
  if (an !== bn) {
    return an - bn
  }
  return a.name.localeCompare(b.name)
}

/**
 * Builds the GNB/LNB nav tree from a site's flat menu list, filtered for the
 * given visitor. A menu appears only when it AND every ancestor is visible
 * (hiding a section hides its whole branch — the legacy behavior). Returns
 * top-level nodes (GNB) each carrying their visible descendants (LNB), sorted
 * by {@link compareMenus} at every level, each with its resolved link.
 *
 * A `parent` pointing at a menu not in the list is treated as top-level (a
 * dangling reference never silently drops the node). Cycle-safe (the collection
 * forbids cycles, but the ancestor walk guards against them anyway).
 */
export function buildNav(menus: NavMenu[], options: { member: CurrentMember }): NavNode[] {
  const { member } = options
  const byId = new Map<string, NavMenu>()
  for (const menu of menus) {
    byId.set(String(menu.id), menu)
  }

  const visibility = new Map<string, boolean>()
  const computeVisible = (menu: NavMenu, seen: Set<string>): boolean => {
    const key = String(menu.id)
    const cached = visibility.get(key)
    if (cached !== undefined) {
      return cached
    }
    if (seen.has(key)) {
      return false // cycle guard — treat as hidden rather than loop forever
    }
    seen.add(key)
    let visible = isMenuVisible(menu, member)
    if (visible) {
      const parentKey = relId(menu.parent)
      if (parentKey !== undefined) {
        const parent = byId.get(parentKey)
        if (parent) {
          visible = computeVisible(parent, seen)
        }
      }
    }
    visibility.set(key, visible)
    return visible
  }

  const visibleMenus = menus.filter((menu) => computeVisible(menu, new Set()))

  const childrenByParent = new Map<string | undefined, NavMenu[]>()
  for (const menu of visibleMenus) {
    const parentKey = relId(menu.parent)
    // A visible menu whose parent is not in the list attaches at the top level.
    const bucket = parentKey !== undefined && byId.has(parentKey) ? parentKey : undefined
    const list = childrenByParent.get(bucket) ?? []
    list.push(menu)
    childrenByParent.set(bucket, list)
  }

  const toNode = (menu: NavMenu): NavNode => {
    const kids = (childrenByParent.get(String(menu.id)) ?? []).slice().sort(compareMenus)
    return { menu, link: resolveMenuLink(menu), children: kids.map(toNode) }
  }

  return (childrenByParent.get(undefined) ?? []).slice().sort(compareMenus).map(toNode)
}

/**
 * The set of menu ids VISIBLE to `member` (Task 4C — the MEDIUM-1 direct-URL
 * gate). A menu id is in the set iff it AND every ancestor pass
 * {@link isMenuVisible} (active + exposureCondition) — exactly the
 * {@link buildNav} filter, flattened. The route resolvers consult this so a
 * menu hidden from the nav (inactive, or `loggedInOnly` for an anonymous
 * visitor) also 404s on a DIRECT URL, not just disappears from the header.
 */
export function visibleMenuIds(menus: NavMenu[], member: CurrentMember): Set<string> {
  const ids = new Set<string>()
  const walk = (nodes: NavNode[]): void => {
    for (const node of nodes) {
      ids.add(String(node.menu.id))
      walk(node.children)
    }
  }
  walk(buildNav(menus, { member }))
  return ids
}

/**
 * Whether the board with `bbsId` is reachable by DIRECT URL for `member`
 * (Task 4C — MEDIUM-1). A board is gated by the `board`-type menu(s) that open
 * it: if one or more menus point at the board, it is accessible iff at least
 * one of those owning menus is visible ({@link visibleMenuIds}); if EVERY owning
 * menu is hidden (inactive / exposure-denied), the board 404s. A board that NO
 * menu references is left directly addressable (there is no owning menu to gate
 * it — the legacy/T4A behavior for un-menued boards), so this never hides a
 * board purely for lacking a nav entry.
 */
export function isBoardMenuAccessible(
  menus: NavMenu[],
  bbsId: string,
  member: CurrentMember,
): boolean {
  const owningMenuIds: string[] = []
  for (const menu of menus) {
    if (menu.contentType !== 'board') {
      continue
    }
    const board = menu.board
    const menuBbsId = board && typeof board === 'object' ? board.bbsId : undefined
    if (typeof menuBbsId === 'string' && menuBbsId === bbsId) {
      owningMenuIds.push(String(menu.id))
    }
  }
  if (owningMenuIds.length === 0) {
    return true // un-menued board — no owning menu to gate it
  }
  const visible = visibleMenuIds(menus, member)
  return owningMenuIds.some((id) => visible.has(id))
}

/** One breadcrumb hop: the menu and its resolved link (the leaf is usually current). */
export type BreadcrumbItem = { menu: NavMenu; link: ResolvedLink }

/**
 * Builds the breadcrumb trail (ref 1-9/3-11) for the menu identified by
 * `targetMenuId`, walking `parent` pointers up to the root and returning the
 * chain ROOT → … → target. Returns `[]` when the target is not in `menus`.
 * Ancestors are resolved against the same list, so a missing ancestor simply
 * ends the trail. Cycle-safe.
 */
export function buildBreadcrumb(menus: NavMenu[], targetMenuId: number | string): BreadcrumbItem[] {
  const byId = new Map<string, NavMenu>()
  for (const menu of menus) {
    byId.set(String(menu.id), menu)
  }
  const trail: NavMenu[] = []
  const seen = new Set<string>()
  let current = byId.get(String(targetMenuId))
  while (current && !seen.has(String(current.id))) {
    seen.add(String(current.id))
    trail.unshift(current)
    const parentKey = relId(current.parent)
    current = parentKey !== undefined ? byId.get(parentKey) : undefined
  }
  return trail.map((menu) => ({ menu, link: resolveMenuLink(menu) }))
}

// ── Footer ──────────────────────────────────────────────────────────────────

/** The footer group's item keys, in render order (mirrors `Sites.ts` footer group). */
export const FOOTER_ITEM_KEYS = [
  'orgName',
  'addressPostalCode',
  'addressLine1',
  'addressLine2',
  'phone',
  'fax',
  'copyright',
] as const

export type FooterItemKey = (typeof FOOTER_ITEM_KEYS)[number]

/** A single footer item to render (label key + trimmed value). */
export type FooterItem = { key: FooterItemKey; value: string }

/** The footer group shape (each item independently toggleable — see `Sites.ts`). */
type FooterGroup = Partial<Record<FooterItemKey, { value?: string | null; show?: boolean | null }>>

/**
 * The footer items to render for a site (ref 1-19), in {@link FOOTER_ITEM_KEYS}
 * order. Honors each item's `show` flag (default shown) and drops blank values —
 * a hidden or empty item never renders. Pure, so the show/hide rule is tested
 * independently of the DB.
 */
export function visibleFooterItems(site: { footer?: FooterGroup | null } | null): FooterItem[] {
  const footer = site?.footer ?? {}
  const items: FooterItem[] = []
  for (const key of FOOTER_ITEM_KEYS) {
    const item = footer[key]
    if (!item || item.show === false) {
      continue
    }
    const value = typeof item.value === 'string' ? item.value.trim() : ''
    if (value.length > 0) {
      items.push({ key, value })
    }
  }
  return items
}

// ── Guide menus (top/bottom utility bars, ref 1-53) ──────────────────────────

/** The subset of a `guideMenus` doc the utility bars read. */
export type GuideMenu = {
  id: number | string
  name: string
  position?: 'top' | 'bottom' | string | null
  linkType?: 'internal' | 'external' | string | null
  linkInternal?: string | null
  linkExternal?: string | null
  newWindow?: boolean | null
  displayOrder?: number | null
  active?: boolean | null
}

/**
 * Resolves a guide menu's link from its `linkType` (ref 1-46/1-52/1-53),
 * re-validating exactly like {@link resolveMenuLink}: `external` must be an
 * http(s) URL, `internal` must be a safe site-relative path; anything else is
 * non-clickable.
 */
export function resolveGuideLink(guide: GuideMenu): ResolvedLink {
  if (guide.linkType === 'external') {
    const url = typeof guide.linkExternal === 'string' ? guide.linkExternal.trim() : ''
    return isHttpUrl(url)
      ? { kind: 'link', href: url, external: true, newWindow: Boolean(guide.newWindow) }
      : { kind: 'none' }
  }
  const url = typeof guide.linkInternal === 'string' ? guide.linkInternal.trim() : ''
  return isSafeInternalLink(url)
    ? { kind: 'link', href: url, external: false, newWindow: Boolean(guide.newWindow) }
    : { kind: 'none' }
}

/**
 * The active guide menus for a bar, sorted by `displayOrder` asc (ref 1-53).
 * Inactive rows are dropped. Order ties fall back to insertion order (stable
 * sort). Pure — the render layer just maps over the result.
 */
export function orderedGuideMenus(guides: GuideMenu[]): GuideMenu[] {
  return guides
    .filter((guide) => guide.active !== false)
    .map((guide, index) => ({ guide, index }))
    .sort((a, b) => {
      const ao = a.guide.displayOrder ?? 0
      const bo = b.guide.displayOrder ?? 0
      return ao !== bo ? ao - bo : a.index - b.index
    })
    .map(({ guide }) => guide)
}
