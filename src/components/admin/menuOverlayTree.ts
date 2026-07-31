/**
 * Pure tree-building logic for the "View all menus" overlay (전체 메뉴 보기; ref
 * 3-11). Kept free of React/Payload imports so it is trivially unit-testable —
 * `ViewAllMenusNavLink.tsx` is the only caller, and it does nothing but fetch
 * `adminMenus` rows and hand them here.
 *
 * ## The security-relevant contract
 *
 * `buildMenuOverlayGroups` takes an `isGranted` predicate and OMITS every node
 * it rejects — not just from the rendered list, but from the `groups` array
 * entirely (a namespace with zero granted, non-root nodes never appears at
 * all). There is no "visible but disabled" state: an ungranted menu's label
 * never reaches the caller, mirroring how `PrivacyNavLink` omits (rather than
 * greys out) links the viewer can't reach. The caller is expected to pass
 * `hasMenuAccessSync(user, menuKey)` (or an equivalent authoritative check) —
 * this module trusts whatever predicate it's given and enforces nothing
 * itself.
 */

export type MenuOverlayNode = {
  id: number | string
  menuKey: string
  name: string
  parentId: number | string | null
  order: number
  collectionSlug?: string | null
}

export type MenuOverlayItem = {
  id: number | string
  menuKey: string
  name: string
  href: string | null
  /** 0 = a direct child of the namespace root; increases with real nesting depth. */
  depth: number
}

export type MenuOverlayGroup = {
  /** The namespace root's own `menuKey` (e.g. "system") — stable React key. */
  namespace: string
  /** The namespace root's display `name` (e.g. "System Management") — the rail label. */
  label: string
  items: MenuOverlayItem[]
}

/**
 * Curated menuKey → admin route map, one entry per VIEW-only (or
 * view-preferred) surface already wired up by the existing `afterNavLinks`
 * components (`PrivacyNavLink`, `StatisticsNavLink`, `StandardizationNavLink`)
 * — reused here rather than re-invented so the overlay always links to the
 * SAME route those dedicated nav entries do, even for a menuKey that also
 * carries a `collectionSlug` (e.g. `system.passwordPolicies` has a real
 * `passwordPolicies` collection, but the curated dedicated view at
 * `/admin/password-policies` is the intended destination, so it takes
 * priority over the generic collection-list fallback below).
 */
const KNOWN_VIEW_HREFS: Record<string, string> = {
  'system.passwordPolicies': '/admin/password-policies',
  'system.errorLogs': '/admin/error-statistics',
  'privacy.orgChart': '/admin/privacy-org-chart',
  'privacy.securityDocs':
    '/admin/collections/boards?where[or][0][and][0][securityDoc][equals]=true',
  'privacy.accessLogs': '/admin/access-history',
  'statistics.traffic': '/admin/traffic-statistics',
  'statistics.downloads': '/admin/download-statistics',
  'statistics.satisfaction': '/admin/satisfaction-statistics',
  'statistics.accessibility': '/admin/accessibility-diagnosis',
  'standardization.codeSpec': '/admin/code-specification',
  'standardization.metaInspection': '/admin/meta-inspection',
  'standardization.tableSettings': '/admin/table-standard-settings',
  'standardization.selfCheck': '/admin/standardization-self-check',
  'standardization.selfCheckStats': '/admin/standardization-self-check-statistics',
}

/**
 * Resolves a leaf menu node to a clickable admin route, or `null` when
 * neither a curated view nor a `collectionSlug` is available — the caller
 * renders `null` as a plain, non-clickable label rather than a dead link.
 * Priority: curated view route (see `KNOWN_VIEW_HREFS`) > generic
 * `/admin/collections/<slug>` (Payload's default list route for a slug-bound
 * node) > `null`.
 *
 * Under the current seed tree (`src/seed/steps/adminMenus.ts`) the ONLY
 * non-root node that resolves to `null` is `system.codes` — a pure grouping
 * node (its three children — classifications/groups/detail codes — each
 * resolve normally via `collectionSlug`).
 */
export function resolveMenuHref(menuKey: string, collectionSlug?: string | null): string | null {
  const known = KNOWN_VIEW_HREFS[menuKey]
  if (known) {
    return known
  }
  if (collectionSlug) {
    return `/admin/collections/${collectionSlug}`
  }
  return null
}

function compareSortKeys(
  a: number[],
  b: number[],
  aId: number | string,
  bId: number | string,
): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? -Infinity) - (b[i] ?? -Infinity)
    if (diff !== 0) {
      return diff
    }
  }
  // Stable, deterministic tiebreak (order collisions are legal — `order` only
  // documents intended sibling sequence, it isn't unique).
  return String(aId).localeCompare(String(bId))
}

/** Walks a node's `parent` chain up to (and including) its namespace root. */
function ancestorChain(
  node: MenuOverlayNode,
  byId: Map<number | string, MenuOverlayNode>,
): MenuOverlayNode[] {
  const chain: MenuOverlayNode[] = []
  const seen = new Set<number | string>()
  let current: MenuOverlayNode | undefined = node
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parentId !== null ? byId.get(current.parentId) : undefined
  }
  return chain
}

/**
 * Groups the FULL `adminMenus` tree by top-level namespace (the rail), then
 * lists — per namespace — only the nodes `isGranted` accepts (the panel),
 * ordered by their real ancestor chain's `order` fields (so sibling order and
 * nesting position are correct even though an ungranted intermediate node's
 * OWN label is never rendered).
 *
 * A namespace root itself (a node with `parentId === null` — "system",
 * "content", "privacy", …) is never listed as a clickable item — it IS the
 * rail label for its group — but a namespace still appears in the result
 * whenever it has at least one granted descendant, regardless of whether the
 * root node's own menuKey happens to be granted.
 */
export function buildMenuOverlayGroups(
  nodes: MenuOverlayNode[],
  isGranted: (menuKey: string) => boolean,
): MenuOverlayGroup[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  type Building = {
    label: string
    order: number
    items: (MenuOverlayItem & { sortKey: number[] })[]
  }
  const groups = new Map<string, Building>()

  for (const node of nodes) {
    if (node.parentId === null) {
      // Namespace roots are never individually listed — see doc comment.
      continue
    }
    if (!isGranted(node.menuKey)) {
      continue
    }

    const chain = ancestorChain(node, byId)
    const root = chain[0]
    if (!root) {
      continue
    }

    const existing = groups.get(root.menuKey)
    const group: Building = existing ?? { label: root.name, order: root.order, items: [] }
    if (!existing) {
      groups.set(root.menuKey, group)
    }

    group.items.push({
      id: node.id,
      menuKey: node.menuKey,
      name: node.name,
      href: resolveMenuHref(node.menuKey, node.collectionSlug),
      depth: Math.max(0, chain.length - 2),
      sortKey: chain.map((n) => n.order),
    })
  }

  return [...groups.entries()]
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([namespace, g]) => ({
      namespace,
      label: g.label,
      items: g.items
        .sort((a, b) => compareSortKeys(a.sortKey, b.sortKey, a.id, b.id))
        .map(({ sortKey: _sortKey, ...item }) => item),
    }))
}
