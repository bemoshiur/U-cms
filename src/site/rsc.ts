/**
 * Request-scoped RSC loaders for the public site (Task 4A). Two cache layers:
 *
 *  - React `cache` (request-scoped) so the layout and the page it renders share
 *    ONE Payload boot and ONE fetch per request.
 *  - Next `unstable_cache` (cross-request Data Cache, `revalidate: 300`, tagged)
 *    for the GLOBAL, non-user-specific shell data — the active site, its menus,
 *    and its top/bottom guide bars (the footer content lives on the `site`
 *    record, so it is covered by the cached site). This is the performance fix:
 *    a warm data cache serves the chrome WITHOUT re-querying Payload/DB per
 *    request (the main cause of the slow serverless loads). On a cache HIT the
 *    wrapped body never runs, so Payload is not even booted for the shell.
 *
 * The MEMBER session (`getCurrentMember` / `payload.auth`) is deliberately NOT
 * cached here — it is per-visitor and must stay correct. Server-only.
 */

import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import { cache } from 'react'

import { isLive, sortByDisplayOrder } from '../content/display'
import type { Banner, GuideMenu, Menu, NotificationArea, Popup, Site } from '../payload-types'
import {
  getBanners as getBannersRaw,
  getGuideMenus as getGuideMenusRaw,
  getNotificationAreas as getNotificationAreasRaw,
  getPopups as getPopupsRaw,
  getSiteMenus as getSiteMenusRaw,
  resolveSiteRecord,
} from './data'

/** Shared revalidate window (5 min) + cache tags for the public shell data. */
const SHELL_REVALIDATE = 300
const SHELL_TAGS = ['public-site']

/** The Local API client (Payload caches the instance; `cache` dedupes the await). */
export const getPayloadClient = cache(async () => getPayload({ config: configPromise }))

/**
 * Cross-request cached loaders. `unstable_cache` keys on the function args, so
 * the menu/guide loaders take the resolved site id explicitly (rather than
 * closing over the request) to keep the cache key correct and per-site.
 */
const cachedActiveSite = unstable_cache(
  async (): Promise<Site | null> => resolveSiteRecord(await getPayloadClient()),
  ['public-active-site'],
  { revalidate: SHELL_REVALIDATE, tags: SHELL_TAGS },
)

const cachedSiteMenus = unstable_cache(
  async (siteId: number | string): Promise<Menu[]> =>
    getSiteMenusRaw(await getPayloadClient(), siteId),
  ['public-site-menus'],
  { revalidate: SHELL_REVALIDATE, tags: SHELL_TAGS },
)

const cachedGuideMenus = unstable_cache(
  async (siteId: number | string, position: 'top' | 'bottom'): Promise<GuideMenu[]> =>
    getGuideMenusRaw(await getPayloadClient(), siteId, position),
  ['public-guide-menus'],
  { revalidate: SHELL_REVALIDATE, tags: SHELL_TAGS },
)

/**
 * Banners / notification areas / popups (Task 4E; refs 1-45..1-53, 2-1). The
 * cache holds EVERY row for the site (live + not-yet-live + expired) — the
 * exposure window is time-sensitive, so `isLive` filtering happens per-request
 * in the `getActive*` loaders below, never baked into the cross-request cache.
 */
const cachedBanners = unstable_cache(
  async (siteId: number | string): Promise<Banner[]> =>
    getBannersRaw(await getPayloadClient(), siteId),
  ['public-banners'],
  { revalidate: SHELL_REVALIDATE, tags: SHELL_TAGS },
)

const cachedNotificationAreas = unstable_cache(
  async (siteId: number | string): Promise<NotificationArea[]> =>
    getNotificationAreasRaw(await getPayloadClient(), siteId),
  ['public-notification-areas'],
  { revalidate: SHELL_REVALIDATE, tags: SHELL_TAGS },
)

const cachedPopups = unstable_cache(
  async (siteId: number | string): Promise<Popup[]> =>
    getPopupsRaw(await getPayloadClient(), siteId),
  ['public-popups'],
  { revalidate: SHELL_REVALIDATE, tags: SHELL_TAGS },
)

/** The active public site for this request, or `null` when none is resolvable. */
export const getActiveSite = cache(async (): Promise<Site | null> => cachedActiveSite())

/** Every menu of the active site (unfiltered/unsorted — feed to `buildNav`). */
export const getActiveSiteMenus = cache(async (): Promise<Menu[]> => {
  const site = await getActiveSite()
  return site ? cachedSiteMenus(site.id) : []
})

/** The active site's guide menus for one utility bar (unsorted — feed to `orderedGuideMenus`). */
export const getActiveGuideMenus = cache(
  async (position: 'top' | 'bottom'): Promise<GuideMenu[]> => {
    const site = await getActiveSite()
    return site ? cachedGuideMenus(site.id, position) : []
  },
)

/**
 * The active site's LIVE banners, ordered by `displayOrder` (Task 4E). Reads
 * the cached (possibly stale-by-up-to-5-min) full row set, then applies
 * `isLive` against `new Date()` for THIS request — so a banner's exposure
 * window is always correct even between cache revalidations, at the cost of
 * never bypassing Payload for the live-ness check itself (cheap, in-memory).
 */
export const getActiveBanners = cache(async (): Promise<Banner[]> => {
  const site = await getActiveSite()
  if (!site) {
    return []
  }
  const all = await cachedBanners(site.id)
  return sortByDisplayOrder(all.filter((banner) => isLive(banner)))
})

/** The active site's LIVE notification areas, ordered by `displayOrder`. See {@link getActiveBanners}. */
export const getActiveNotificationAreas = cache(async (): Promise<NotificationArea[]> => {
  const site = await getActiveSite()
  if (!site) {
    return []
  }
  const all = await cachedNotificationAreas(site.id)
  return sortByDisplayOrder(all.filter((area) => isLive(area)))
})

/**
 * The active site's LIVE popups (no `displayOrder` — the collection has none;
 * render order follows the DB's natural order). See {@link getActiveBanners}.
 */
export const getActivePopups = cache(async (): Promise<Popup[]> => {
  const site = await getActiveSite()
  if (!site) {
    return []
  }
  const all = await cachedPopups(site.id)
  return all.filter((popup) => isLive(popup))
})
