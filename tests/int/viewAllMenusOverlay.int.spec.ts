import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { hasMenuAccessSync, warmAdminMenuKeyCache } from '@/access/hasMenuAccess'
import { buildMenuOverlayGroups, type MenuOverlayNode } from '@/components/admin/menuOverlayTree'
import { adminMenusStep } from '@/seed/steps/adminMenus'

/**
 * Audit fix 3 (ref 3-11) — the "View all menus" overlay is READ-ONLY
 * navigation, but the whole point of the fix is that its server-side
 * filtering is REAL, not decorative: a confined admin must see strictly
 * fewer systems/menus than a super-admin, using the SAME code path
 * `ViewAllMenusNavLink` uses in production (a real `adminMenus` read via the
 * Local API + `hasMenuAccessSync` against a real, populated-role user +
 * `buildMenuOverlayGroups`). This boots real Payload against Postgres and
 * exercises the actual seeded menu tree — not a hand-rolled fixture — so it
 * proves the gating on the REAL data shape, not just the pure-logic unit.
 */

let payload: Payload

/** Loads the full adminMenus tree in the exact shape ViewAllMenusNavLink uses. */
async function loadNodes(): Promise<MenuOverlayNode[]> {
  const { docs } = await payload.find({
    collection: 'adminMenus',
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((doc) => ({
    id: doc.id,
    menuKey: doc.menuKey,
    name: doc.name,
    parentId: typeof doc.parent === 'number' || typeof doc.parent === 'string' ? doc.parent : null,
    order: doc.order ?? 0,
    collectionSlug: doc.collectionSlug ?? null,
  }))
}

async function menuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (typeof id !== 'number') {
    throw new Error(`menu "${menuKey}" not found — did adminMenusStep run?`)
  }
  return id
}

describe('View All Menus overlay — server-side gating (ref 3-11)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await adminMenusStep.run(payload)
    // adminMenusStep runs AFTER payload.config's onInit (which warms the
    // hasMenuAccessSync cache from whatever adminMenus existed at boot, i.e.
    // possibly none on a fresh test DB) — re-warm now that the full tree
    // definitely exists, exactly as an operator restarting the server would
    // pick up newly-seeded menus.
    await warmAdminMenuKeyCache(payload)
  })

  it('a roleless viewer sees NO systems at all', async () => {
    const nodes = await loadNodes()
    const roleless = { id: 1, roles: [] }
    const groups = buildMenuOverlayGroups(nodes, (menuKey) => hasMenuAccessSync(roleless, menuKey))
    expect(groups).toEqual([])
  })

  it('a super-admin sees every namespace the real seed tree has', async () => {
    const nodes = await loadNodes()
    const superUser = { id: 2, roles: [{ id: 99, isSuper: true, menuGrants: [] }] }
    const groups = buildMenuOverlayGroups(nodes, (menuKey) => hasMenuAccessSync(superUser, menuKey))

    const expectedNamespaces = new Set(
      nodes.filter((n) => n.parentId === null).map((n) => n.menuKey),
    )
    expect(new Set(groups.map((g) => g.namespace))).toEqual(expectedNamespaces)
    expect(groups.length).toBeGreaterThanOrEqual(6) // system/content/privacy/members/statistics/standardization
  })

  it('a limited admin (ONE grant, in ONE namespace) sees strictly fewer systems and menus than a super-admin — proves the filtering is real, not cosmetic', async () => {
    const nodes = await loadNodes()
    const postsMenuId = await menuId('content.posts')

    const limitedUser = {
      id: 3,
      roles: [{ id: 100, isSuper: false, menuGrants: [postsMenuId] }],
    }
    const superUser = { id: 4, roles: [{ id: 99, isSuper: true, menuGrants: [] }] }

    const limitedGroups = buildMenuOverlayGroups(nodes, (menuKey) =>
      hasMenuAccessSync(limitedUser, menuKey),
    )
    const superGroups = buildMenuOverlayGroups(nodes, (menuKey) =>
      hasMenuAccessSync(superUser, menuKey),
    )

    // Exactly one system (content), exactly one menu (content.posts) — every
    // other node in the real seeded tree (dozens of them) is invisible.
    expect(limitedGroups).toHaveLength(1)
    expect(limitedGroups[0]!.namespace).toBe('content')
    expect(limitedGroups[0]!.items.map((i) => i.menuKey)).toEqual(['content.posts'])

    // Strictly fewer systems AND strictly fewer total menu items than super.
    expect(limitedGroups.length).toBeLessThan(superGroups.length)
    const limitedItemCount = limitedGroups.reduce((n, g) => n + g.items.length, 0)
    const superItemCount = superGroups.reduce((n, g) => n + g.items.length, 0)
    expect(limitedItemCount).toBeLessThan(superItemCount)
    expect(limitedItemCount).toBe(1)

    // The ungranted sibling content.media must not merely be hidden from the
    // top level — it must not appear ANYWHERE in the limited admin's output.
    const limitedAllKeys = limitedGroups.flatMap((g) => g.items.map((i) => i.menuKey))
    expect(limitedAllKeys).not.toContain('content.media')
    expect(limitedAllKeys).not.toContain('system.sites')
  })
})
