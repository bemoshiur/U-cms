import type { Payload } from 'payload'

/**
 * Shared helpers + exported source-of-truth constants for the RICH DEMO SEED
 * (owner mandate: the CMS must not look empty — see
 * `.superpowers/sdd/TODO/task-richseed-brief.md`). Every rich step layers
 * PLENTIFUL, realistic, English government-portal content ON TOP of the minimal
 * Phase 1-6 seeds, additively and idempotently (stable natural keys /
 * find-or-create). These helpers keep every rich step DRY and let the
 * integration + unit tests assert against one source of truth.
 */

/** A minimal valid 1×1 transparent PNG — reused for every seeded raster image. */
export const SEED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

/** Returns a fresh Buffer for the seed placeholder PNG. */
export function pngBuffer(): Buffer {
  return Buffer.from(SEED_PNG_BASE64, 'base64')
}

/** A tiny but structurally valid single-page PDF — reused for data-library files. */
const SEED_PDF =
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
  'trailer<</Size 4/Root 1 0 R>>\n' +
  '%%EOF\n'

/** Returns a fresh Buffer for the seed placeholder PDF. */
export function pdfBuffer(): Buffer {
  return Buffer.from(SEED_PDF, 'utf8')
}

/** A minimal valid Lexical editor-state carrying one or more paragraphs of text. */
export function lexical(...paragraphs: string[]) {
  const blocks = paragraphs.length > 0 ? paragraphs : ['']
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: blocks.map((text) => ({
        type: 'paragraph',
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        children: [
          { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 },
        ],
      })),
    },
  }
}

/** ISO timestamp `days` whole days before now (UTC), at a stable mid-morning hour. */
export function daysAgoISO(days: number, hour = 9): string {
  const d = new Date(Date.now() - days * 86_400_000)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}

/** Resolves a site's numeric id by its `siteId` (e.g. `demo`, `bos`); throws if absent. */
export async function siteIdBySiteId(payload: Payload, siteId: string): Promise<number> {
  const found = await payload.find({
    collection: 'sites',
    where: { siteId: { equals: siteId } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (id === undefined) {
    throw new Error(`[seed:rich] site "${siteId}" not found — did sitesStep run first?`)
  }
  return id
}

/** Resolves a department id by name (first match), or undefined. */
export async function departmentIdByName(
  payload: Payload,
  name: string,
): Promise<number | undefined> {
  const found = await payload.find({
    collection: 'departments',
    where: { name: { equals: name } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.id
}

/** Resolves an adminMenu id by its permanent menuKey, or undefined. */
export async function adminMenuIdByKey(
  payload: Payload,
  menuKey: string,
): Promise<number | undefined> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.id
}

/**
 * The extra login-capable admin accounts seeded for the demo (owner mandate:
 * ~6-8 admins across roles so the account list + org chart look real). All are
 * `active` and share the super-admin password source
 * (`SEED_ADMIN_PASSWORD`, dev default `changeme-dev-only!`) — a KNOWN password
 * on a public deploy is refused in production by
 * `assertSeedAdminPasswordSafeForProduction`. Exported so the report + tests
 * assert against one source of truth.
 */
export const RICH_ADMIN_ACCOUNTS: {
  loginId: string
  email: string
  name: string
  roleId: string
  departmentName: string
  duties: string
  mobile: string
  extension: string
}[] = [
  {
    loginId: 'content-editor',
    email: 'content-editor@admin.demo.example.com',
    name: 'Claire Bennett',
    roleId: 'ROLE_CONTENT_EDITOR',
    departmentName: 'Public Relations Division',
    duties: 'Website content, notices, and board moderation',
    mobile: '010-2000-1001',
    extension: '2101',
  },
  {
    loginId: 'privacy-officer',
    email: 'privacy-officer@admin.demo.example.com',
    name: 'Daniel Cho',
    roleId: 'ROLE_PRIVACY_OFFICER',
    departmentName: 'Administrative Services Division',
    duties: 'Personal-information protection and access-log review',
    mobile: '010-2000-1002',
    extension: '2102',
  },
  {
    loginId: 'comms-admin',
    email: 'comms-admin@admin.demo.example.com',
    name: 'Erin Park',
    roleId: 'ROLE_CONTENT_EDITOR',
    departmentName: 'Public Relations Division',
    duties: 'Press releases and media relations',
    mobile: '010-2000-1003',
    extension: '2103',
  },
  {
    loginId: 'stats-analyst',
    email: 'stats-analyst@admin.demo.example.com',
    name: 'Felix Nam',
    roleId: 'ROLE_STATISTICS_ANALYST',
    departmentName: 'Planning & Coordination Division',
    duties: 'Traffic, satisfaction, and download statistics review',
    mobile: '010-2000-1004',
    extension: '2104',
  },
]

/** The two extra (non-super) admin roles seeded for the demo. */
export const RICH_ROLES: {
  roleId: string
  name: string
  description: string
  menuKeys: string[]
}[] = [
  {
    roleId: 'ROLE_CONTENT_EDITOR',
    name: 'Content Editor',
    description:
      'Manages public content: boards, posts, menus, web content, display components, surveys, and terms. No system, privacy, or member administration.',
    menuKeys: [
      'content',
      'content.media',
      'content.boardTypes',
      'content.boards',
      'content.posts',
      'content.notificationAreas',
      'content.popups',
      'content.banners',
      'content.adminNotices',
      'content.guideMenus',
      'content.menus',
      'content.webContents',
      'content.shortUrls',
      'content.help',
      'content.surveys',
      'content.terms',
    ],
  },
  {
    roleId: 'ROLE_STATISTICS_ANALYST',
    name: 'Statistics Analyst',
    description:
      'Read/manage access to the site statistics dashboards: traffic, satisfaction, download, and web-accessibility auto-diagnosis statistics.',
    menuKeys: [
      'statistics',
      'statistics.satisfaction',
      'statistics.traffic',
      'statistics.downloads',
      'statistics.accessibility',
    ],
  },
]

/** Number of extra active public members seeded on the demo site (member01..memberNN). */
export const RICH_MEMBER_COUNT = 18

/** Realistic member display names, cycled to build the demo member roster. */
export const RICH_MEMBER_NAMES = [
  'James Wilson',
  'Sophia Kim',
  'Michael Turner',
  'Olivia Hughes',
  'Benjamin Lee',
  'Emma Novak',
  'Lucas Meyer',
  'Grace Han',
  'Henry Foster',
  'Chloe Martin',
  'Nathan Reed',
  'Ava Sinclair',
  'Ethan Brooks',
  'Mia Larsson',
  'Owen Clarke',
  'Isla Petrov',
  'Leo Fischer',
  'Zoe Adams',
]
