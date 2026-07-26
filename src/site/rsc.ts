/**
 * Request-scoped RSC loaders for the public site (Task 4A). Wrap the
 * `./data.ts` resolvers with React `cache` so the layout and the page it
 * renders share ONE Payload boot and ONE site/menus fetch per request (the
 * layout needs the site + top menus + guide bars; a page needs the same menus
 * for its LNB/breadcrumb). Server-only — imported by Server Components.
 */

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { GuideMenu, Menu, Site } from '../payload-types'
import {
  getGuideMenus as getGuideMenusRaw,
  getSiteMenus as getSiteMenusRaw,
  resolveSiteRecord,
} from './data'

/** The Local API client (Payload caches the instance; `cache` dedupes the await). */
export const getPayloadClient = cache(async () => getPayload({ config: configPromise }))

/** The active public site for this request, or `null` when none is resolvable. */
export const getActiveSite = cache(async (): Promise<Site | null> => {
  const payload = await getPayloadClient()
  return resolveSiteRecord(payload)
})

/** Every menu of the active site (unfiltered/unsorted — feed to `buildNav`). */
export const getActiveSiteMenus = cache(async (): Promise<Menu[]> => {
  const site = await getActiveSite()
  if (!site) {
    return []
  }
  const payload = await getPayloadClient()
  return getSiteMenusRaw(payload, site.id)
})

/** The active site's guide menus for one utility bar (unsorted — feed to `orderedGuideMenus`). */
export const getActiveGuideMenus = cache(
  async (position: 'top' | 'bottom'): Promise<GuideMenu[]> => {
    const site = await getActiveSite()
    if (!site) {
      return []
    }
    const payload = await getPayloadClient()
    return getGuideMenusRaw(payload, site.id, position)
  },
)
