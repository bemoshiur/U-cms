import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * Example menus + a versioned web content + a short URL + a couple site-help
 * entries (Task 3D). Gives Phase 4 (public rendering) and the version-diff /
 * help / short-URL features real data to work against. Idempotent: every row is
 * looked up by a natural key before create, and the web content is created ONCE
 * with two versions (so restore/diff is exercisable) — re-runs never add more.
 *
 *  - demo-site menus: a `content`-type "Home" menu (bound to the web content),
 *    a `board`-type "Notice" menu (bound to the seeded Notice board), and a
 *    `link`-type "External" menu.
 *  - one web content bound to the Home menu, saved twice (v1 → v2) so its
 *    version history is non-trivial.
 *  - one short URL on the demo site.
 *  - two global help entries: one menu-bound, one service (URL-pattern) bound.
 */

export const SEED_MENU_HOME = 'Home'
export const SEED_MENU_NOTICE = 'Notice'
export const SEED_MENU_EXTERNAL = 'External Site'
export const SEED_WEBCONTENT_TITLE = 'Welcome page'
export const SEED_WEBCONTENT_V2_TITLE = 'Welcome page (updated)'
export const SEED_SHORTURL_NAME = 'Demo external link'
export const SEED_HELP_MENU = 'Home screen help'
export const SEED_HELP_SERVICE = 'Board list help'

/** A minimal valid Lexical editor-state carrying a single paragraph of text. */
function lexical(text: string) {
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: [
        {
          type: 'paragraph',
          format: '' as const,
          indent: 0,
          version: 1,
          direction: 'ltr' as const,
          children: [
            { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 },
          ],
        },
      ],
    },
  }
}

async function demoSiteId(payload: Payload): Promise<number> {
  const demo = await payload.find({
    collection: 'sites',
    where: { siteId: { equals: 'demo' } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = demo.docs[0]?.id
  if (id === undefined) {
    throw new Error('[seed:content-menus] demo site not found — did sitesStep run first?')
  }
  return id
}

/** Finds a menu by (tenant, name), or creates it; returns the id. Idempotent. */
async function ensureMenu(
  payload: Payload,
  tenantId: number,
  name: string,
  data: Record<string, unknown>,
): Promise<number> {
  const existing = await payload.find({
    collection: 'menus',
    where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: name } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    return existing.docs[0].id
  }
  const created = await payload.create({
    collection: 'menus',
    data: { tenant: tenantId, name, ...data },
    overrideAccess: true,
  })
  payload.logger.info(`[seed:content-menus] created menu "${name}".`)
  return created.id
}

export const contentMenusStep: SeedStep = {
  name: 'content-menus',
  async run(payload: Payload) {
    const tenantId = await demoSiteId(payload)

    // ── menus ─────────────────────────────────────────────────────────────
    const homeMenuId = await ensureMenu(payload, tenantId, SEED_MENU_HOME, {
      contentType: 'content',
      order: 1,
    })

    const noticeBoard = await payload.find({
      collection: 'boards',
      where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: 'Notice' } }] },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const noticeBoardId = noticeBoard.docs[0]?.id
    await ensureMenu(payload, tenantId, SEED_MENU_NOTICE, {
      contentType: 'board',
      order: 2,
      ...(noticeBoardId !== undefined ? { board: noticeBoardId } : {}),
    })

    await ensureMenu(payload, tenantId, SEED_MENU_EXTERNAL, {
      contentType: 'link',
      order: 3,
      linkUrl: 'https://example.com',
      newWindow: true,
    })

    // ── web content bound to the Home menu (saved twice → 2 versions) ──────
    const existingContent = await payload.find({
      collection: 'webContents',
      where: { menu: { equals: homeMenuId } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existingContent.docs.length === 0) {
      const created = await payload.create({
        collection: 'webContents',
        data: {
          menu: homeMenuId,
          name: 'home',
          title: SEED_WEBCONTENT_TITLE,
          content: lexical('Welcome to the demo site.'),
          // PUBLISH so the page renders publicly (B3: only published content is
          // served — an unpublished draft would 404).
          _status: 'published',
        },
        overrideAccess: true,
      })
      // Second save → a new PUBLISHED version, so diff/restore is exercisable and
      // the active (rendered) version stays published.
      await payload.update({
        collection: 'webContents',
        id: created.id,
        data: {
          title: SEED_WEBCONTENT_V2_TITLE,
          content: lexical('Welcome to the demo site. This copy has been revised.'),
          _status: 'published',
        },
        overrideAccess: true,
      })
      payload.logger.info('[seed:content-menus] created web content with 2 versions.')
    } else {
      payload.logger.info('[seed:content-menus] web content already exists — skipping.')
    }

    // ── short URL on the demo site ────────────────────────────────────────
    const existingShort = await payload.find({
      collection: 'shortUrls',
      where: {
        and: [{ tenant: { equals: tenantId } }, { linkName: { equals: SEED_SHORTURL_NAME } }],
      },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existingShort.docs.length === 0) {
      await payload.create({
        collection: 'shortUrls',
        data: {
          tenant: tenantId,
          linkName: SEED_SHORTURL_NAME,
          originalUrl: 'https://example.com/a/very/long/destination/path',
        },
        overrideAccess: true,
      })
      payload.logger.info('[seed:content-menus] created short URL.')
    } else {
      payload.logger.info('[seed:content-menus] short URL already exists — skipping.')
    }

    // ── global help entries (menu-bound + service-bound) ──────────────────
    const homeMenu = await payload.findByID({
      collection: 'menus',
      id: homeMenuId,
      depth: 0,
      overrideAccess: true,
    })
    const homeMenuNumber = (homeMenu as { menuNumber?: number }).menuNumber

    await ensureHelp(payload, SEED_HELP_MENU, {
      bindType: 'menu',
      ...(typeof homeMenuNumber === 'number' ? { menuNumber: homeMenuNumber } : {}),
      content: lexical('Help for the home screen.'),
    })
    await ensureHelp(payload, SEED_HELP_SERVICE, {
      bindType: 'service',
      urlPattern: '/bos/board/*',
      content: lexical('Help for any board list screen.'),
    })
  },
}

/** Finds a help entry by name, or creates it. Idempotent. */
async function ensureHelp(
  payload: Payload,
  name: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'helpEntries',
    where: { name: { equals: name } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    payload.logger.info(`[seed:content-menus] help "${name}" already exists — skipping.`)
    return
  }
  await payload.create({ collection: 'helpEntries', data: { name, ...data }, overrideAccess: true })
  payload.logger.info(`[seed:content-menus] created help "${name}".`)
}
