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

export const publicSiteStep: SeedStep = {
  name: 'public-site',
  async run(payload: Payload) {
    const site = await demoSite(payload)
    const tenantId = site.id

    // ── logo + footer on the demo site ────────────────────────────────────
    const needsLogo = !site.logo
    const needsFooter = !site.footer?.copyright?.value
    if (needsLogo || needsFooter) {
      const logoId = needsLogo ? await ensureLogoMedia(payload) : undefined
      await payload.update({
        collection: 'sites',
        id: tenantId,
        data: {
          ...(needsLogo ? { logo: logoId } : {}),
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
      payload.logger.info('[seed:public-site] updated demo site logo/footer.')
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
    await ensureGuideMenu(payload, tenantId, SEED_DEMO_GUIDE_BOTTOM, {
      position: 'bottom',
      linkType: 'external',
      linkExternal: 'https://example.com/privacy',
      newWindow: false,
      displayOrder: 0,
      active: true,
    })
  },
}
