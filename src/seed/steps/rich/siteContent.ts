import type { Payload } from 'payload'

import type { SeedStep } from '../../types'
import { lexical, pngBuffer, siteIdBySiteId } from './shared'

/**
 * A full public-site menu tree (GNB → LNB → breadcrumb depth) for the demo site
 * plus the menu-bound web-content pages, short URLs, help tree, and extra guide
 * menus (owner mandate: the public site must look like a real running portal —
 * refs 1-44/2-13, 2-2..2-4, 1-42/1-43, 1-80). Includes loggedInOnly /
 * loggedOutOnly menus for the exposure demo and two versioned pages (v1 → v2)
 * so the diff/version UI is exercisable. Idempotent: menus by (tenant, name),
 * web content by bound menu, short URLs by (tenant, linkName), help by name.
 */

type MenuNode = {
  name: string
  contentType: 'placeholder' | 'board' | 'content' | 'link'
  boardName?: string
  linkUrl?: string
  newWindow?: boolean
  exposureCondition?: 'always' | 'loggedInOnly' | 'loggedOutOnly'
  webContent?: { title: string; name: string; body: string[]; versioned?: boolean }
  children?: MenuNode[]
}

const PAGE_CLOSE =
  'For assistance, contact the responsible department or use the online enquiry service.'

const MENU_TREE: MenuNode[] = [
  {
    name: 'About Us',
    contentType: 'placeholder',
    children: [
      {
        name: 'Greeting',
        contentType: 'content',
        webContent: {
          title: 'Greeting from the Mayor',
          name: 'about-greeting',
          versioned: true,
          body: [
            'Welcome to our public service portal. We are committed to open, resident-centered administration.',
            'Through this portal you can access notices, civil services, and participate in shaping local policy.',
            PAGE_CLOSE,
          ],
        },
      },
      {
        name: 'Organization',
        contentType: 'content',
        webContent: {
          title: 'Organization',
          name: 'about-organization',
          body: [
            'Our organization is structured into four divisions supporting planning, public relations, administration, and technology.',
            'Each division comprises specialized teams that deliver day-to-day public services.',
            PAGE_CLOSE,
          ],
        },
      },
      {
        name: 'Directory',
        contentType: 'content',
        webContent: {
          title: 'Department Directory',
          name: 'about-directory',
          body: [
            'Use the directory to find the right department for your enquiry, along with contact numbers and duties.',
            PAGE_CLOSE,
          ],
        },
      },
      {
        name: 'History',
        contentType: 'content',
        webContent: {
          title: 'Our History',
          name: 'about-history',
          body: [
            'A brief history of our organization and the milestones that shaped the services we provide today.',
            PAGE_CLOSE,
          ],
        },
      },
    ],
  },
  {
    name: 'Services',
    contentType: 'placeholder',
    children: [
      {
        name: 'Online Services',
        contentType: 'content',
        webContent: {
          title: 'Online Services',
          name: 'services-online',
          versioned: true,
          body: [
            'A growing range of civil services is available online, 24 hours a day.',
            'Apply for documents, pay local taxes and fees, and track the status of your requests.',
            PAGE_CLOSE,
          ],
        },
      },
      {
        name: 'Civil Applications',
        contentType: 'content',
        webContent: {
          title: 'Civil Applications',
          name: 'services-civil',
          body: [
            'Submit and manage civil applications online, with clear guidance on required documents and processing times.',
            PAGE_CLOSE,
          ],
        },
      },
      {
        name: 'Payments',
        contentType: 'content',
        webContent: {
          title: 'Online Payments',
          name: 'services-payments',
          body: [
            'Pay local taxes, fees, and charges securely using card, bank transfer, or mobile wallet.',
            PAGE_CLOSE,
          ],
        },
      },
    ],
  },
  {
    name: 'News & Notices',
    contentType: 'placeholder',
    children: [
      { name: 'Notices', contentType: 'board', boardName: 'Notice' },
      { name: 'Press Releases', contentType: 'board', boardName: 'Press Releases' },
      { name: 'Gallery', contentType: 'board', boardName: 'Gallery' },
      { name: 'FAQ', contentType: 'board', boardName: 'FAQ' },
    ],
  },
  {
    name: 'Participation',
    contentType: 'placeholder',
    children: [
      { name: 'Q&A', contentType: 'board', boardName: 'Q&A' },
      { name: 'Data Library', contentType: 'board', boardName: 'Attachment Board' },
      {
        name: 'Open Data Portal',
        contentType: 'link',
        linkUrl: 'https://example.com/open-data',
        newWindow: true,
      },
    ],
  },
  {
    name: 'Information',
    contentType: 'placeholder',
    children: [
      {
        name: 'Accessibility Statement',
        contentType: 'content',
        webContent: {
          title: 'Accessibility Statement',
          name: 'info-accessibility',
          body: [
            'We are committed to making our website accessible to everyone, in line with recognized accessibility standards.',
            'If you encounter an accessibility barrier, please let us know so we can address it.',
            PAGE_CLOSE,
          ],
        },
      },
      {
        name: 'Open Data Policy',
        contentType: 'content',
        webContent: {
          title: 'Open Data Policy',
          name: 'info-open-data',
          body: [
            'Our open-data policy sets out how public datasets are published, licensed, and kept up to date.',
            PAGE_CLOSE,
          ],
        },
      },
    ],
  },
  {
    // Exposure demo: this whole section is only visible to logged-in members.
    name: 'Member Zone',
    contentType: 'placeholder',
    exposureCondition: 'loggedInOnly',
    children: [
      {
        name: 'My Bookmarks',
        contentType: 'link',
        linkUrl: '/member/bookmarks',
        exposureCondition: 'loggedInOnly',
      },
    ],
  },
  {
    // Exposure demo: only shown to logged-out visitors.
    name: 'Sign Up',
    contentType: 'link',
    linkUrl: '/sign-up',
    exposureCondition: 'loggedOutOnly',
  },
]

async function boardIdByName(
  payload: Payload,
  tenantId: number,
  name: string,
): Promise<number | undefined> {
  const found = await payload.find({
    collection: 'boards',
    where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: name } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.id
}

async function ensureMenu(
  payload: Payload,
  tenantId: number,
  node: MenuNode,
  parentId: number | undefined,
  order: number,
): Promise<number> {
  const existing = await payload.find({
    collection: 'menus',
    where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: node.name } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    return existing.docs[0].id
  }
  const data: Record<string, unknown> = {
    tenant: tenantId,
    name: node.name,
    contentType: node.contentType,
    order,
    ...(parentId !== undefined ? { parent: parentId } : {}),
    ...(node.exposureCondition ? { exposureCondition: node.exposureCondition } : {}),
  }
  if (node.contentType === 'board' && node.boardName) {
    const boardId = await boardIdByName(payload, tenantId, node.boardName)
    if (boardId !== undefined) {
      data.board = boardId
    }
  }
  if (node.contentType === 'link' && node.linkUrl) {
    data.linkUrl = node.linkUrl
    if (node.newWindow) {
      data.newWindow = true
    }
  }
  const created = await payload.create({
    collection: 'menus',
    data: data as never,
    overrideAccess: true,
  })
  payload.logger.info(`[seed:rich-site] created menu "${node.name}".`)
  return created.id
}

/** Binds a versioned web content to a content menu (idempotent by bound menu). */
async function ensureWebContent(
  payload: Payload,
  menuId: number,
  wc: NonNullable<MenuNode['webContent']>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'webContents',
    where: { menu: { equals: menuId } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    return
  }
  const created = await payload.create({
    collection: 'webContents',
    data: {
      menu: menuId,
      name: wc.name,
      title: wc.title,
      content: lexical(...wc.body),
      _status: 'published',
    } as never,
    overrideAccess: true,
  })
  if (wc.versioned) {
    // A second published version so the diff/restore UI has real history.
    await payload.update({
      collection: 'webContents',
      id: created.id,
      data: {
        title: `${wc.title} (updated)`,
        content: lexical(...wc.body, 'This page was revised with the latest information.'),
        _status: 'published',
      } as never,
      overrideAccess: true,
    })
  }
  payload.logger.info(`[seed:rich-site] bound web content "${wc.title}".`)
}

async function walkMenus(
  payload: Payload,
  tenantId: number,
  nodes: MenuNode[],
  parentId: number | undefined,
  baseOrder: number,
): Promise<void> {
  for (const [i, node] of nodes.entries()) {
    const id = await ensureMenu(payload, tenantId, node, parentId, baseOrder + i)
    if (node.contentType === 'content' && node.webContent) {
      await ensureWebContent(payload, id, node.webContent)
    }
    if (node.children && node.children.length > 0) {
      await walkMenus(payload, tenantId, node.children, id, 1)
    }
  }
}

const SHORT_URLS: { linkName: string; originalUrl: string; remarks?: string }[] = [
  { linkName: 'Notices board', originalUrl: '/notices', remarks: 'Public notices board' },
  { linkName: 'Press releases', originalUrl: '/press-releases' },
  { linkName: 'Online services', originalUrl: '/services/online' },
  { linkName: 'Data library', originalUrl: '/data-library' },
  { linkName: 'Open data portal', originalUrl: 'https://example.com/open-data' },
]

type HelpNode = {
  name: string
  bindType: 'service' | 'menu'
  urlPattern?: string
  menuName?: string
  body: string
  children?: HelpNode[]
}

const HELP_TREE: HelpNode[] = [
  {
    name: 'Getting started',
    bindType: 'service',
    urlPattern: '/',
    body: 'Welcome to the help center. Use the sections below to learn how to use the portal.',
    children: [
      {
        name: 'Using the boards',
        bindType: 'service',
        urlPattern: '/board/*',
        body: 'How to browse a board, read a post, and download attachments.',
      },
      {
        name: 'Submitting a civil complaint',
        bindType: 'service',
        urlPattern: '/complaints/*',
        body: 'How to submit a civil complaint online and track its status.',
      },
    ],
  },
  {
    name: 'Managing your member account',
    bindType: 'service',
    urlPattern: '/member/*',
    body: 'How to update your profile, change your password, and manage notifications.',
  },
  {
    name: 'Greeting page help',
    bindType: 'menu',
    menuName: 'Greeting',
    body: 'Guidance shown on the greeting page.',
  },
]

async function ensureShortUrl(
  payload: Payload,
  tenantId: number,
  def: { linkName: string; originalUrl: string; remarks?: string },
): Promise<void> {
  const existing = await payload.find({
    collection: 'shortUrls',
    where: { and: [{ tenant: { equals: tenantId } }, { linkName: { equals: def.linkName } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    return
  }
  await payload.create({
    collection: 'shortUrls',
    data: {
      tenant: tenantId,
      linkName: def.linkName,
      originalUrl: def.originalUrl,
      ...(def.remarks ? { remarks: def.remarks } : {}),
    },
    overrideAccess: true,
  })
  payload.logger.info(`[seed:rich-site] created short URL "${def.linkName}".`)
}

async function ensureHelp(
  payload: Payload,
  tenantId: number,
  node: HelpNode,
  parentId: number | undefined,
  order: number,
): Promise<void> {
  const existing = await payload.find({
    collection: 'helpEntries',
    where: { name: { equals: node.name } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  let id = existing.docs[0]?.id
  if (id === undefined) {
    const data: Record<string, unknown> = {
      name: node.name,
      bindType: node.bindType,
      order,
      content: lexical(node.body),
      ...(parentId !== undefined ? { parent: parentId } : {}),
    }
    if (node.bindType === 'service' && node.urlPattern) {
      data.urlPattern = node.urlPattern
    }
    if (node.bindType === 'menu' && node.menuName) {
      const menu = await payload.find({
        collection: 'menus',
        where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: node.menuName } }] },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const menuNumber = (menu.docs[0] as { menuNumber?: number } | undefined)?.menuNumber
      if (typeof menuNumber === 'number') {
        data.menuNumber = menuNumber
      }
    }
    const created = await payload.create({
      collection: 'helpEntries',
      data: data as never,
      overrideAccess: true,
    })
    id = created.id
    payload.logger.info(`[seed:rich-site] created help "${node.name}".`)
  }
  for (const [i, child] of (node.children ?? []).entries()) {
    await ensureHelp(payload, tenantId, child, id, i)
  }
}

const EXTRA_GUIDE_MENUS: {
  name: string
  position: 'top' | 'bottom'
  link: string
  internal: boolean
}[] = [
  { name: 'Sitemap', position: 'top', link: '/sitemap', internal: true },
  { name: 'Contact', position: 'top', link: '/contact', internal: true },
  { name: 'Accessibility', position: 'bottom', link: '/page/accessibility', internal: true },
  { name: 'Open Data', position: 'bottom', link: 'https://example.com/open-data', internal: false },
  { name: 'Copyright Policy', position: 'bottom', link: '/copyright', internal: true },
]

async function ensureGuideMenu(
  payload: Payload,
  tenantId: number,
  def: { name: string; position: 'top' | 'bottom'; link: string; internal: boolean },
  order: number,
): Promise<void> {
  const existing = await payload.find({
    collection: 'guideMenus',
    where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: def.name } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    return
  }
  await payload.create({
    collection: 'guideMenus',
    data: {
      tenant: tenantId,
      name: def.name,
      position: def.position,
      linkType: def.internal ? 'internal' : 'external',
      ...(def.internal ? { linkInternal: def.link } : { linkExternal: def.link }),
      newWindow: !def.internal,
      displayOrder: order,
      active: true,
    } as never,
    overrideAccess: true,
  })
  payload.logger.info(`[seed:rich-site] created guide menu "${def.name}".`)
}

export const richSiteStructureStep: SeedStep = {
  name: 'rich-site-structure',
  async run(payload: Payload) {
    const tenantId = await siteIdBySiteId(payload, 'demo')

    await walkMenus(payload, tenantId, MENU_TREE, undefined, 10)

    for (const s of SHORT_URLS) {
      await ensureShortUrl(payload, tenantId, s)
    }
    for (const [i, node] of HELP_TREE.entries()) {
      await ensureHelp(payload, tenantId, node, undefined, i)
    }
    for (const [i, g] of EXTRA_GUIDE_MENUS.entries()) {
      await ensureGuideMenu(payload, tenantId, g, i)
    }
  },
}

// ── Display components ───────────────────────────────────────────────────────

/** Finds a media image by alt, or creates it once (public display-asset pool). */
async function ensureMedia(payload: Payload, alt: string): Promise<number> {
  const existing = await payload.find({
    collection: 'media',
    where: { alt: { equals: alt } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs[0]?.id !== undefined) {
    return existing.docs[0].id
  }
  const data = pngBuffer()
  const created = await payload.create({
    collection: 'media',
    data: { alt },
    file: {
      data,
      name: `seed-display-${Date.now()}-${Math.floor(Math.random() * 100000)}.png`,
      mimetype: 'image/png',
      size: data.length,
    },
    overrideAccess: true,
  })
  return created.id
}

async function ensureDisplayByTitle(
  payload: Payload,
  collection: 'notificationAreas' | 'popups' | 'banners' | 'adminNotices',
  tenantId: number,
  title: string,
  build: () => Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection,
    where: { and: [{ tenant: { equals: tenantId } }, { title: { equals: title } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    return
  }
  await payload.create({ collection, data: build() as never, overrideAccess: true })
  payload.logger.info(`[seed:rich-display] created ${collection} "${title}".`)
}

const DAY = 86_400_000

/**
 * Several banners, popups, notification-area items (demo site) and admin
 * notices (admin 'bos' site) with real exposure windows — some live now, one
 * scheduled — so the display components + admin-notice screens look populated
 * (owner mandate; refs 1-45..1-53, 2-1). Idempotent by (tenant, title).
 */
export const richDisplayStep: SeedStep = {
  name: 'rich-display',
  async run(payload: Payload) {
    const demoId = await siteIdBySiteId(payload, 'demo')
    const bosId = await siteIdBySiteId(payload, 'bos')
    const now = Date.now()
    const liveFrom = new Date(now - 10 * DAY).toISOString()
    const liveTo = new Date(now + 30 * DAY).toISOString()

    const bannerImg = await ensureMedia(payload, 'Seed banner image')
    const popupImg = await ensureMedia(payload, 'Seed popup image')
    const notifImg = await ensureMedia(payload, 'Seed notification image')

    // Banners (demo) — one representative, all live now.
    const banners = [
      { title: 'Apply for civil services online', link: '/services/online', rep: true },
      { title: 'FY2026 budget public hearings', link: '/notices', rep: false },
      {
        title: 'Open Data Portal',
        link: 'https://example.com/open-data',
        rep: false,
        external: true,
      },
      { title: 'Join the community programs', link: '/participation', rep: false },
    ]
    for (const [i, b] of banners.entries()) {
      await ensureDisplayByTitle(payload, 'banners', demoId, b.title, () => ({
        tenant: demoId,
        image: bannerImg,
        isRepresentative: b.rep,
        title: b.title,
        linkType: b.external ? 'external' : 'internal',
        ...(b.external ? { linkExternal: b.link } : { linkInternal: b.link }),
        newWindow: Boolean(b.external),
        active: true,
        exposeFrom: liveFrom,
        exposeTo: liveTo,
        displayOrder: i,
      }))
    }

    // Popups (demo) — one live now, one scheduled for the future.
    await ensureDisplayByTitle(payload, 'popups', demoId, 'Scheduled maintenance notice', () => ({
      tenant: demoId,
      image: popupImg,
      title: 'Scheduled maintenance notice',
      linkType: 'internal',
      linkInternal: '/notices',
      active: true,
      exposeFrom: liveFrom,
      exposeTo: liveTo,
      width: 420,
      height: 320,
      top: 120,
      left: 120,
      showScrollbar: false,
      closeForDay: true,
    }))
    await ensureDisplayByTitle(payload, 'popups', demoId, 'Upcoming community fair', () => ({
      tenant: demoId,
      image: popupImg,
      title: 'Upcoming community fair',
      linkType: 'internal',
      linkInternal: '/participation',
      active: true,
      exposeFrom: new Date(now + 14 * DAY).toISOString(),
      exposeTo: new Date(now + 44 * DAY).toISOString(),
      width: 400,
      height: 300,
      top: 100,
      left: 100,
      showScrollbar: false,
      closeForDay: true,
    }))

    // Notification areas (demo).
    const notifs = [
      { title: 'New online payment methods available', link: '/services/payments' },
      { title: 'Annual satisfaction survey now open', link: '/participation' },
    ]
    for (const [i, n] of notifs.entries()) {
      await ensureDisplayByTitle(payload, 'notificationAreas', demoId, n.title, () => ({
        tenant: demoId,
        image: notifImg,
        title: n.title,
        linkType: 'internal',
        linkInternal: n.link,
        newWindow: false,
        active: true,
        exposeFrom: liveFrom,
        exposeTo: liveTo,
        displayOrder: i,
      }))
    }

    // Admin notices (admin 'bos' site) — pinned + general.
    const adminNotices = [
      {
        title: 'Complete your 2FA enrolment',
        type: 'pinned' as const,
        author: 'System Administrator',
      },
      {
        title: 'New content approval workflow in effect',
        type: 'pinned' as const,
        author: 'System Administrator',
      },
      {
        title: 'Quarterly access-log review reminder',
        type: 'general' as const,
        author: 'Privacy Officer',
      },
      {
        title: 'Style guide updated for press releases',
        type: 'general' as const,
        author: 'Public Relations',
      },
      {
        title: 'Scheduled database maintenance this weekend',
        type: 'general' as const,
        author: 'Systems Operations',
      },
    ]
    for (const n of adminNotices) {
      await ensureDisplayByTitle(payload, 'adminNotices', bosId, n.title, () => ({
        tenant: bosId,
        noticeType: n.type,
        title: n.title,
        author: n.author,
        content: lexical(`${n.title}. Please review and take any required action.`),
        ...(n.type === 'pinned' ? { pinFrom: liveFrom, pinTo: liveTo } : {}),
      }))
    }
  },
}
