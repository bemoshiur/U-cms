import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * Example per-site display components (Task 3C, refs 1-45..1-53 / 2-1) so
 * Phase 4/5 rendering has data. Seeds — idempotently — one notification area,
 * one popup, and one banner on the DEMO site (ref 2-1: the demo main page hosts
 * banner/notification/popup instances), one pinned admin notice on the ADMIN
 * site ('bos'), and a top + a bottom guide menu on the ADMIN site.
 *
 * Each item is looked up by (tenant, title/name) before create; the shared seed
 * image is looked up by its `alt` so re-runs reuse one media row instead of
 * piling up duplicates (media has no natural unique key).
 */

/** A tiny 1×1 transparent PNG reused for every seeded display image. */
const SEED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

const SEED_IMAGE_ALT = 'Seed display component image'

/** Exported so the integration test asserts against the same source of truth. */
export const SEED_NOTIFICATION_TITLE = 'Pulse CMS v3.0 released'
export const SEED_POPUP_TITLE = 'Welcome to the demo site'
export const SEED_BANNER_TITLE = 'Sample banner'
export const SEED_ADMIN_NOTICE_TITLE = 'Please always check administrator notices'
export const SEED_GUIDE_MENUS: { name: string; position: 'top' | 'bottom' }[] = [
  { name: 'Help', position: 'top' },
  { name: 'Privacy Policy', position: 'bottom' },
]

async function siteIdBySiteId(payload: Payload, siteId: string): Promise<number> {
  const found = await payload.find({
    collection: 'sites',
    where: { siteId: { equals: siteId } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (id === undefined) {
    throw new Error(`[seed:display] site "${siteId}" not found — did sitesStep run first?`)
  }
  return id
}

/** Finds the shared seed image (by alt) or creates it once. */
async function ensureSeedImage(payload: Payload): Promise<number> {
  const existing = await payload.find({
    collection: 'media',
    where: { alt: { equals: SEED_IMAGE_ALT } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs[0]?.id !== undefined) {
    return existing.docs[0].id
  }
  const data = Buffer.from(SEED_PNG_BASE64, 'base64')
  const created = await payload.create({
    collection: 'media',
    data: { alt: SEED_IMAGE_ALT },
    file: {
      data,
      name: `seed-display-${Date.now()}.png`,
      mimetype: 'image/png',
      size: data.length,
    },
    overrideAccess: true,
  })
  return created.id
}

/** Creates a doc iff no doc on `tenant` already has the given title/name. */
async function ensureByTitle(
  payload: Payload,
  collection: 'notificationAreas' | 'popups' | 'banners' | 'adminNotices' | 'guideMenus',
  tenantId: number,
  titleField: 'title' | 'name',
  titleValue: string,
  build: () => Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection,
    where: { and: [{ tenant: { equals: tenantId } }, { [titleField]: { equals: titleValue } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    payload.logger.info(`[seed:display] ${collection} "${titleValue}" already exists — skipping.`)
    return
  }
  await payload.create({ collection, data: build() as never, overrideAccess: true })
  payload.logger.info(`[seed:display] created ${collection} "${titleValue}".`)
}

export const displayComponentsStep: SeedStep = {
  name: 'display-components',
  async run(payload: Payload) {
    const demoSiteId = await siteIdBySiteId(payload, 'demo')
    const adminSiteId = await siteIdBySiteId(payload, 'bos')

    // Only touch media once we know at least one item may need creating; the
    // ensureByTitle guards still skip create when the item already exists, so
    // the shared image is fetched/created at most once per run.
    const imageId = await ensureSeedImage(payload)

    await ensureByTitle(
      payload,
      'notificationAreas',
      demoSiteId,
      'title',
      SEED_NOTIFICATION_TITLE,
      () => ({
        tenant: demoSiteId,
        image: imageId,
        title: SEED_NOTIFICATION_TITLE,
        linkType: 'external',
        linkExternal: 'https://example.com/release-notes',
        newWindow: true,
        active: true,
        displayOrder: 0,
      }),
    )

    await ensureByTitle(payload, 'popups', demoSiteId, 'title', SEED_POPUP_TITLE, () => ({
      tenant: demoSiteId,
      image: imageId,
      title: SEED_POPUP_TITLE,
      linkType: 'internal',
      linkInternal: '/',
      active: true,
      width: 400,
      height: 300,
      top: 100,
      left: 100,
      showScrollbar: false,
      closeForDay: true,
    }))

    await ensureByTitle(payload, 'banners', demoSiteId, 'title', SEED_BANNER_TITLE, () => ({
      tenant: demoSiteId,
      image: imageId,
      isRepresentative: true,
      title: SEED_BANNER_TITLE,
      linkType: 'external',
      linkExternal: 'https://example.com',
      newWindow: true,
      active: true,
      displayOrder: 0,
    }))

    await ensureByTitle(
      payload,
      'adminNotices',
      adminSiteId,
      'title',
      SEED_ADMIN_NOTICE_TITLE,
      () => ({
        tenant: adminSiteId,
        noticeType: 'pinned',
        title: SEED_ADMIN_NOTICE_TITLE,
        author: 'Administrator',
      }),
    )

    for (const [i, menu] of SEED_GUIDE_MENUS.entries()) {
      await ensureByTitle(payload, 'guideMenus', adminSiteId, 'name', menu.name, () => ({
        tenant: adminSiteId,
        position: menu.position,
        name: menu.name,
        linkType: 'internal',
        linkInternal: `/${menu.name.toLowerCase().replace(/\s+/g, '-')}`,
        displayOrder: i,
        newWindow: false,
        active: true,
      }))
    }
  },
}
