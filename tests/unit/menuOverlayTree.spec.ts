import { describe, expect, it } from 'vitest'

import {
  buildMenuOverlayGroups,
  resolveMenuHref,
  type MenuOverlayNode,
} from '@/components/admin/menuOverlayTree'

/**
 * Audit fix 3 (ref 3-11) — pure tree-building logic for the "View all menus"
 * overlay. Exercises the security-relevant contract directly (an ungranted
 * node's label must never appear anywhere in the output, not even as a
 * disabled placeholder) plus the href-resolution priority and hierarchy/
 * ordering rules, all without booting Payload.
 */

// A small fixture mirroring the REAL seed shape (src/seed/steps/adminMenus.ts):
// two namespaces, one namespace with an ungranted grouping node in the middle
// of the chain (mirrors "system.codes").
const NODES: MenuOverlayNode[] = [
  { id: 1, menuKey: 'system', name: 'System Management', parentId: null, order: 1 },
  {
    id: 2,
    menuKey: 'system.sites',
    name: 'Site Information Management',
    parentId: 1,
    order: 1,
    collectionSlug: 'sites',
  },
  { id: 3, menuKey: 'system.codes', name: 'Code Management', parentId: 1, order: 2 },
  {
    id: 4,
    menuKey: 'system.codes.groups',
    name: 'Code Groups',
    parentId: 3,
    order: 1,
    collectionSlug: 'codeGroups',
  },
  {
    id: 5,
    menuKey: 'system.codes.detail',
    name: 'Detail Codes',
    parentId: 3,
    order: 2,
    collectionSlug: 'codes',
  },
  { id: 6, menuKey: 'content', name: 'Content Management', parentId: null, order: 2 },
  {
    id: 7,
    menuKey: 'content.posts',
    name: 'Post Management',
    parentId: 6,
    order: 1,
    collectionSlug: 'posts',
  },
  {
    id: 8,
    menuKey: 'content.media',
    name: 'Media Management',
    parentId: 6,
    order: 2,
    collectionSlug: 'media',
  },
]

describe('buildMenuOverlayGroups', () => {
  it('returns nothing when the predicate grants nothing (fully roleless viewer)', () => {
    expect(buildMenuOverlayGroups(NODES, () => false)).toEqual([])
  })

  it('omits a namespace ENTIRELY when none of its nodes are granted — never a visible-but-empty group', () => {
    const groups = buildMenuOverlayGroups(NODES, (menuKey) => menuKey.startsWith('content.'))
    expect(groups.map((g) => g.namespace)).toEqual(['content'])
    expect(groups[0]!.items.map((i) => i.menuKey)).toEqual(['content.posts', 'content.media'])
  })

  it("never leaks an ungranted node's label — omits it entirely rather than graying it out", () => {
    // Grant only content.posts; content.media must not appear anywhere, not
    // even as a disabled/plain entry.
    const groups = buildMenuOverlayGroups(NODES, (menuKey) => menuKey === 'content.posts')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.items).toHaveLength(1)
    expect(groups[0]!.items[0]!.menuKey).toBe('content.posts')
    const allNames = groups.flatMap((g) => g.items.map((i) => i.name))
    expect(allNames).not.toContain('Media Management')
  })

  it('includes a granted leaf even when its direct parent grouping node is ungranted', () => {
    // Grant only system.codes.groups — NOT system.codes (the mid-level
    // grouping node) and NOT system.codes.detail.
    const groups = buildMenuOverlayGroups(NODES, (menuKey) => menuKey === 'system.codes.groups')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.namespace).toBe('system')
    expect(groups[0]!.label).toBe('System Management')
    expect(groups[0]!.items.map((i) => i.menuKey)).toEqual(['system.codes.groups'])
    // "Code Management" (the ungranted parent) must not appear as a label.
    expect(groups[0]!.items.map((i) => i.name)).not.toContain('Code Management')
  })

  it('never lists a namespace root itself as a clickable item, even if directly granted', () => {
    const groups = buildMenuOverlayGroups(NODES, (menuKey) => menuKey === 'system')
    expect(groups).toEqual([])
  })

  // Grants every node EXCEPT the pure grouping node `system.codes` (which has
  // no `collectionSlug` of its own) — mirrors how real roles are seeded (only
  // leaf/view menu keys are ever granted; see src/seed/steps/*.ts).
  const grantAllLeaves = (menuKey: string): boolean => menuKey !== 'system.codes'

  it("sorts namespaces by the root node's own `order`, and items by ancestor-chain order", () => {
    const groups = buildMenuOverlayGroups(NODES, grantAllLeaves)
    expect(groups.map((g) => g.namespace)).toEqual(['system', 'content'])
    const systemItems = groups[0]!.items.map((i) => i.menuKey)
    // system.sites (order 1 under system) before system.codes.* (order 2 under
    // system); within system.codes, groups (order 1) before detail (order 2).
    expect(systemItems).toEqual(['system.sites', 'system.codes.groups', 'system.codes.detail'])
  })

  it('assigns depth based on real nesting even when an intermediate label is omitted', () => {
    const groups = buildMenuOverlayGroups(NODES, grantAllLeaves)
    const bySystem = groups.find((g) => g.namespace === 'system')!
    const sites = bySystem.items.find((i) => i.menuKey === 'system.sites')!
    const codeGroups = bySystem.items.find((i) => i.menuKey === 'system.codes.groups')!
    expect(sites.depth).toBe(0) // direct child of the namespace root
    expect(codeGroups.depth).toBe(1) // grandchild (system > system.codes > system.codes.groups)
  })

  it('resolves an href for every granted item that has a collectionSlug', () => {
    const groups = buildMenuOverlayGroups(NODES, grantAllLeaves)
    const allItems = groups.flatMap((g) => g.items)
    for (const item of allItems) {
      expect(item.href, `${item.menuKey} should resolve an href`).toBe(
        `/admin/collections/${NODES.find((n) => n.menuKey === item.menuKey)!.collectionSlug}`,
      )
    }
  })
})

describe('resolveMenuHref', () => {
  it('prefers a curated view route over a generic collection route when both exist', () => {
    // system.passwordPolicies has a real `passwordPolicies` collection AND a
    // curated dedicated view — the view must win.
    expect(resolveMenuHref('system.passwordPolicies', 'passwordPolicies')).toBe(
      '/admin/password-policies',
    )
  })

  it('falls back to the generic /admin/collections/<slug> route when no curated view exists', () => {
    expect(resolveMenuHref('content.posts', 'posts')).toBe('/admin/collections/posts')
  })

  it('resolves a curated view route for a menu with no collectionSlug at all', () => {
    expect(resolveMenuHref('privacy.orgChart', undefined)).toBe('/admin/privacy-org-chart')
  })

  it('returns null (plain-label fallback) when neither a curated view nor a collectionSlug exists', () => {
    expect(resolveMenuHref('system.codes', undefined)).toBeNull()
    expect(resolveMenuHref('system.codes', null)).toBeNull()
  })
})
