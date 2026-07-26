import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * Public-site (Task 4A) demo data so the frontend chrome has something real to
 * render: a demo-site logo + footer, a top-level section with children (to
 * exercise GNB → LNB → breadcrumb), and a top + bottom guide menu (the
 * configured extras beside the fixed Login/Sign-up/Sitemap defaults).
 *
 * Runs after `contentMenusStep` (which creates the demo Home/Notice/External
 * top menus + a web content). Every unit is INDEPENDENTLY idempotent — looked
 * up by a natural key before create/update — so `pnpm seed` re-runs add nothing.
 */

export const SEED_DEMO_LOGO_ALT = 'Demo Site logo'
export const SEED_MENU_ABOUT = 'About'
export const SEED_MENU_ABOUT_INTRO = 'Introduction'
export const SEED_MENU_ABOUT_DIRECTORY = 'Directory'
export const SEED_DEMO_GUIDE_TOP = 'User Guide'
export const SEED_DEMO_GUIDE_BOTTOM = 'Privacy Policy'
export const SEED_MENU_NOTICES = 'Notices'
/** Reuses the `Notice` board created by `boardsStep` (see src/seed/steps/boards.ts). */
export const SEED_BOARD_NOTICES = 'Notice'
export const SEED_NOTICE_POST_TITLE = 'Welcome to the demo notice board'

/** A tiny 1×1 PNG (valid image/png, passes the site-logo mimetype gate). */
const SEED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

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

async function demoSite(payload: Payload) {
  const found = await payload.find({
    collection: 'sites',
    where: { siteId: { equals: 'demo' } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const site = found.docs[0]
  if (!site) {
    throw new Error('[seed:public-site] demo site not found — did sitesStep run first?')
  }
  return site
}

/** Finds the shared logo media (by alt) or creates it once. */
async function ensureLogoMedia(payload: Payload): Promise<number> {
  const existing = await payload.find({
    collection: 'media',
    where: { alt: { equals: SEED_DEMO_LOGO_ALT } },
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
    data: { alt: SEED_DEMO_LOGO_ALT },
    file: { data, name: `demo-logo-${Date.now()}.png`, mimetype: 'image/png', size: data.length },
    overrideAccess: true,
  })
  return created.id
}

/** Finds a demo menu by (tenant, name), or creates it; returns the id. Idempotent. */
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
  payload.logger.info(`[seed:public-site] created menu "${name}".`)
  return created.id
}

/** Creates a demo guide menu by (tenant, name) if absent. Idempotent. */
async function ensureGuideMenu(
  payload: Payload,
  tenantId: number,
  name: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'guideMenus',
    where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: name } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    return
  }
  await payload.create({
    collection: 'guideMenus',
    // `as never`: guideMenus' create Options is a discriminated union that TS
    // narrows to the draft-required branch for a widened data object — the same
    // quirk (and workaround) as displayComponentsStep.
    data: { tenant: tenantId, name, ...data } as never,
    overrideAccess: true,
  })
  payload.logger.info(`[seed:public-site] created guide menu "${name}".`)
}

/**
 * Seeds a demo NOTICE board (integrated kind) with a board menu (so it shows in
 * the GNB and `/board/[bbsId]` resolves) and one post carrying an attachment —
 * the real content Task 4C's list/detail routes render, and what the public-site
 * e2e browses (board list → post detail → managed download link). Idempotent.
 */
async function ensureNoticeBoard(payload: Payload, tenantId: number): Promise<void> {
  // Integrated board type (PG0001) — the standard list board.
  const boardTypes = await payload.find({
    collection: 'boardTypes',
    where: { kind: { equals: 'integrated' } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const boardTypeId = boardTypes.docs[0]?.id
  if (boardTypeId === undefined) {
    return // board types not seeded yet — skip (idempotent re-run will pick it up)
  }

  const existingBoard = await payload.find({
    collection: 'boards',
    where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: SEED_BOARD_NOTICES } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  let board = existingBoard.docs[0]
  if (!board) {
    board = await payload.create({
      collection: 'boards',
      data: {
        tenant: tenantId,
        name: SEED_BOARD_NOTICES,
        boardType: boardTypeId,
        attachmentsEnabled: true,
        attachmentMaxCount: 3,
        listCount: 10,
        pageCount: 10,
      },
      overrideAccess: true,
    })
    payload.logger.info('[seed:public-site] created Notice board.')
  }

  // A top-level board menu so the board appears in the GNB and its owning-menu
  // gate (MEDIUM-1) is satisfied for direct-URL access.
  await ensureMenu(payload, tenantId, SEED_MENU_NOTICES, {
    contentType: 'board',
    board: board.id,
    order: 5,
  })

  // Seed an admin HTML header notice that INCLUDES a script-injection attempt —
  // the public render must sanitize it (the `<script>` is stripped, the safe
  // markup survives). The e2e asserts the neutralization at runtime. Idempotent:
  // rewritten only until it carries the script marker.
  const currentNotice = typeof board.headerNotice === 'string' ? board.headerNotice : ''
  if (!currentNotice.includes('<script')) {
    await payload.update({
      collection: 'boards',
      id: board.id,
      data: {
        headerNotice:
          '<p class="notice-text">This is the Notice board.</p><script>window.__xss=1</script>',
      },
      overrideAccess: true,
    })
    payload.logger.info('[seed:public-site] set Notice board header notice (with XSS probe).')
  }

  // One post with an attachment (the e2e follows its managed-download link).
  const existingPost = await payload.find({
    collection: 'posts',
    where: {
      and: [{ board: { equals: board.id } }, { title: { equals: SEED_NOTICE_POST_TITLE } }],
    },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existingPost.docs.length === 0) {
    const data = Buffer.from(SEED_PNG_BASE64, 'base64')
    const attachment = await payload.create({
      collection: 'attachments',
      data: { alt: 'Demo notice attachment', tenant: tenantId } as never,
      file: {
        data,
        name: `demo-notice-${Date.now()}.png`,
        mimetype: 'image/png',
        size: data.length,
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'posts',
      data: {
        board: board.id,
        title: SEED_NOTICE_POST_TITLE,
        author: 'Demo Admin',
        content: lexical('This is a demo notice with an attachment.'),
        attachments: [{ media: attachment.id, description: 'Demo attachment' }],
      } as never,
      overrideAccess: true,
    })
    payload.logger.info('[seed:public-site] created Notice post + attachment.')
  }
}

export const publicSiteStep: SeedStep = {
  name: 'public-site',
  async run(payload: Payload) {
    const site = await demoSite(payload)
    const tenantId = site.id

    // ── logo + footer + feature toggles on the demo site ──────────────────
    const needsLogo = !site.logo
    const needsFooter = !site.footer?.copyright?.value
    // Enable the satisfaction widget on the demo site (Task 4E) so the per-page
    // rating widget renders out of the box.
    const needsSatisfaction = site.satisfactionEnabled !== true
    if (needsLogo || needsFooter || needsSatisfaction) {
      const logoId = needsLogo ? await ensureLogoMedia(payload) : undefined
      await payload.update({
        collection: 'sites',
        id: tenantId,
        data: {
          ...(needsLogo ? { logo: logoId } : {}),
          ...(needsSatisfaction ? { satisfactionEnabled: true } : {}),
          ...(needsFooter
            ? {
                footer: {
                  orgName: { value: 'Demo Organization', show: true },
                  addressLine1: { value: '123 Example Street, Seoul', show: true },
                  phone: { value: '02-1234-5678', show: true },
                  fax: { value: '02-1234-5679', show: false },
                  copyright: { value: '© Demo Organization. All rights reserved.', show: true },
                },
              }
            : {}),
        },
        overrideAccess: true,
      })
      payload.logger.info('[seed:public-site] updated demo site logo/footer/toggles.')
    }

    // ── a top-level section with children (GNB → LNB → breadcrumb) ─────────
    const aboutId = await ensureMenu(payload, tenantId, SEED_MENU_ABOUT, {
      contentType: 'placeholder',
      order: 4,
    })
    const introId = await ensureMenu(payload, tenantId, SEED_MENU_ABOUT_INTRO, {
      contentType: 'content',
      parent: aboutId,
      order: 1,
    })
    await ensureMenu(payload, tenantId, SEED_MENU_ABOUT_DIRECTORY, {
      contentType: 'link',
      parent: aboutId,
      order: 2,
      linkUrl: 'https://example.com/directory',
      newWindow: true,
    })

    // Bind web content to the Introduction menu so /page/[menuNumber] resolves.
    const existingContent = await payload.find({
      collection: 'webContents',
      where: { menu: { equals: introId } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existingContent.docs.length === 0) {
      await payload.create({
        collection: 'webContents',
        data: {
          menu: introId,
          name: 'introduction',
          title: 'About — Introduction',
          content: lexical('An introduction to the demo organization.'),
        },
        overrideAccess: true,
      })
      payload.logger.info('[seed:public-site] created Introduction web content.')
    }

    // ── configured guide-menu extras (top + bottom bars) ──────────────────
    await ensureGuideMenu(payload, tenantId, SEED_DEMO_GUIDE_TOP, {
      position: 'top',
      linkType: 'external',
      linkExternal: 'https://example.com/guide',
      newWindow: true,
      displayOrder: 0,
      active: true,
    })
    // The "Privacy Policy" bottom guide points at the real terms page (Task 4E
    // Part 2b — the legally-emphasized link must resolve to actual content).
    await ensureGuideMenu(payload, tenantId, SEED_DEMO_GUIDE_BOTTOM, {
      position: 'bottom',
      linkType: 'internal',
      linkInternal: '/terms/personalInfoProcessing',
      newWindow: false,
      displayOrder: 0,
      active: true,
    })
    // Reconcile an EXISTING demo guide that still points at the old external
    // placeholder, so the privacy link resolves on already-seeded demo DBs too.
    const legacyPrivacyGuide = await payload.find({
      collection: 'guideMenus',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { name: { equals: SEED_DEMO_GUIDE_BOTTOM } },
          { linkExternal: { equals: 'https://example.com/privacy' } },
        ],
      },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (legacyPrivacyGuide.docs[0]) {
      await payload.update({
        collection: 'guideMenus',
        id: legacyPrivacyGuide.docs[0].id,
        data: { linkType: 'internal', linkInternal: '/terms/personalInfoProcessing' } as never,
        overrideAccess: true,
      })
      payload.logger.info('[seed:public-site] repointed Privacy Policy guide to /terms.')
    }

    // ── a real board + post + attachment (Task 4C list/detail + e2e) ──────────
    await ensureNoticeBoard(payload, tenantId)
  },
}
