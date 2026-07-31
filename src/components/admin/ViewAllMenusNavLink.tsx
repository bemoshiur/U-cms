import type { ServerProps } from 'payload'
import React from 'react'

import { hasMenuAccessSync } from '@/access/hasMenuAccess'

import { buildMenuOverlayGroups, type MenuOverlayNode } from './menuOverlayTree'
import { ViewAllMenusOverlay } from './ViewAllMenusOverlay'

/**
 * "View all menus" (전체 메뉴 보기; ref 3-11) — a global, full-screen sitemap
 * overlay reachable from every admin page (satisfies the legacy spec's "from
 * Home": the dashboard IS `/admin`). Registered in `admin.components.
 * afterNavLinks` alongside `StatisticsNavLink` / `PrivacyNavLink` /
 * `StandardizationNavLink`.
 *
 * ## Data source: `ServerProps.payload`, not a new endpoint
 *
 * `ServerProps` (see `node_modules/payload/dist/config/types.d.ts`) exposes a
 * live `payload: Payload` instance directly — the same Local API every seed
 * step and other server component in this codebase already uses — so a
 * dedicated read-only endpoint isn't needed. `overrideAccess: true` on the
 * `find` is safe: the *raw* read only ever happens on the server, inside this
 * component, and every single node it returns is re-checked against the
 * viewer's REAL grants (`hasMenuAccessSync`) before anything is turned into
 * props for the client half — see `buildMenuOverlayGroups`. Nothing ungranted
 * ever crosses the server/client boundary.
 *
 * SERVER component (async — the one `await` is the `adminMenus` read). Renders
 * nothing (`null`) if the viewer's grants leave zero namespaces with any
 * accessible menu, matching how the other `afterNavLinks` components hide
 * themselves when they'd otherwise render empty.
 */
export async function ViewAllMenusNavLink(props: ServerProps): Promise<React.ReactElement | null> {
  const { docs } = await props.payload.find({
    collection: 'adminMenus',
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const nodes: MenuOverlayNode[] = docs.map((doc) => ({
    id: doc.id,
    menuKey: doc.menuKey,
    name: doc.name,
    parentId: typeof doc.parent === 'number' || typeof doc.parent === 'string' ? doc.parent : null,
    order: doc.order ?? 0,
    collectionSlug: doc.collectionSlug ?? null,
  }))

  const groups = buildMenuOverlayGroups(nodes, (menuKey) => hasMenuAccessSync(props.user, menuKey))

  if (groups.length === 0) {
    return null
  }

  return <ViewAllMenusOverlay groups={groups} />
}

export default ViewAllMenusNavLink
