import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { handleWebContentDiff } from '@/endpoints/webContentDiff'
import { handleShortUrlRedirect } from '@/endpoints/shortUrlRedirect'
import { handleBoardExport } from '@/endpoints/boardExport'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { boardTypesStep } from '@/seed/steps/boardTypes'
import {
  contentMenusStep,
  SEED_MENU_HOME,
  SEED_SHORTURL_NAME,
  SEED_HELP_MENU,
} from '@/seed/steps/contentMenus'

let payload: Payload

const TEST_PASSWORD = 'a-long-enough-test-password-1'

function marker(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}
function uniqueSiteId(label: string): string {
  return `t${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}
function lettersOnly(): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  let out = ''
  while (n > 0) {
    out += String.fromCharCode(97 + (n % 26))
    n = Math.floor(n / 26)
  }
  return out
}

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

async function adminMenuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (id === undefined) {
    throw new Error(`adminMenu ${menuKey} not seeded`)
  }
  return id
}

describe('content engine: menus + web content + short URLs + help (Task 3D)', () => {
  let siteAId: number
  let siteBId: number
  let scopedAUser: Awaited<ReturnType<typeof payload.create>>
  let scopedBUser: Awaited<ReturnType<typeof payload.create>>
  let superUser: Awaited<ReturnType<typeof payload.create>>
  let photoTypeId: number

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])

    const siteA = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('ca'), name: 'Content A', url: 'https://ca.example.com' },
      overrideAccess: true,
    })
    const siteB = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('cb'), name: 'Content B', url: 'https://cb.example.com' },
      overrideAccess: true,
    })
    siteAId = siteA.id
    siteBId = siteB.id

    const boardType = await payload.find({
      collection: 'boardTypes',
      where: { code: { equals: 'PG0002' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    photoTypeId = boardType.docs[0]!.id

    const grantIds = [
      await adminMenuId('content.menus'),
      await adminMenuId('content.webContents'),
      await adminMenuId('content.shortUrls'),
      await adminMenuId('content.boards'),
      await adminMenuId('content.posts'),
      await adminMenuId('content.help'),
    ]

    const roleA = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_T3D_A_${lettersOnly().toUpperCase()}`,
        name: 'T3D content role A',
        description: 'Grants content.* (non-super), site A.',
        menuGrants: grantIds,
      },
      overrideAccess: true,
    })
    const roleB = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_T3D_B_${lettersOnly().toUpperCase()}`,
        name: 'T3D content role B',
        description: 'Grants content.* (non-super), site B.',
        menuGrants: grantIds,
      },
      overrideAccess: true,
    })
    scopedAUser = await payload.create({
      collection: 'users',
      data: {
        email: `t3d-a-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
        password: TEST_PASSWORD,
        roles: [roleA.id],
        tenants: [{ tenant: siteAId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    scopedBUser = await payload.create({
      collection: 'users',
      data: {
        email: `t3d-b-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
        password: TEST_PASSWORD,
        roles: [roleB.id],
        tenants: [{ tenant: siteBId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })

    const superRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_T3D_SUPER_${lettersOnly().toUpperCase()}`,
        name: 'T3D super role',
        description: 'isSuper for Task 3D tests.',
        isSuper: true,
      },
      overrideAccess: true,
    })
    superUser = await payload.create({
      collection: 'users',
      data: {
        email: `t3d-super-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
        password: TEST_PASSWORD,
        roles: [superRole.id],
        status: 'active',
      },
      overrideAccess: true,
    })
  })

  // ── menus ────────────────────────────────────────────────────────────────
  describe('menus', () => {
    it('auto-assigns a per-site menuNumber (immutable) and defaults contentType', async () => {
      const m1 = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: marker('M1') },
        overrideAccess: true,
      })
      const m2 = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: marker('M2') },
        overrideAccess: true,
      })
      expect(typeof m1.menuNumber).toBe('number')
      expect(typeof m2.menuNumber).toBe('number')
      expect(m2.menuNumber).not.toBe(m1.menuNumber)
      expect(m1.contentType).toBe('placeholder')

      // Immutable: a non-override write cannot change menuNumber (field access).
      const patched = await payload.update({
        collection: 'menus',
        id: m1.id,
        data: { menuNumber: 999999 } as never,
        user: superUser,
        overrideAccess: false,
      })
      expect(patched.menuNumber).toBe(m1.menuNumber)
    })

    it('reuses low menuNumbers on a different site (per-site uniqueness)', async () => {
      const a = await payload.create({
        collection: 'menus',
        data: { tenant: siteBId, name: marker('BsiteFirst') },
        overrideAccess: true,
      })
      // Site B is independent, so its own sequence is unaffected by site A's.
      expect(typeof a.menuNumber).toBe('number')
      // Two menus on site B get distinct numbers.
      const b = await payload.create({
        collection: 'menus',
        data: { tenant: siteBId, name: marker('BsiteSecond') },
        overrideAccess: true,
      })
      expect(b.menuNumber).not.toBe(a.menuNumber)
    })

    it('prevents a parent cycle', async () => {
      const parent = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: marker('CycleP') },
        overrideAccess: true,
      })
      const child = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: marker('CycleC'), parent: parent.id },
        overrideAccess: true,
      })
      await expect(
        payload.update({
          collection: 'menus',
          id: parent.id,
          data: { parent: child.id },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects a parent that belongs to a different site (tenant)', async () => {
      const parentOnB = await payload.create({
        collection: 'menus',
        data: { tenant: siteBId, name: marker('ParentB') },
        overrideAccess: true,
      })
      await expect(
        payload.create({
          collection: 'menus',
          data: { tenant: siteAId, name: marker('ChildA'), parent: parentOnB.id },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('requires a valid linkUrl for a Link menu and rejects a javascript: target', async () => {
      // Missing linkUrl for a link menu → rejected.
      await expect(
        payload.create({
          collection: 'menus',
          data: { tenant: siteAId, name: marker('NoLink'), contentType: 'link' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
      // Dangerous scheme → rejected.
      await expect(
        payload.create({
          collection: 'menus',
          data: {
            tenant: siteAId,
            name: marker('JsLink'),
            contentType: 'link',
            linkUrl: 'javascript:alert(1)',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
      // Valid absolute + valid internal → accepted.
      const ok = await payload.create({
        collection: 'menus',
        data: {
          tenant: siteAId,
          name: marker('GoodLink'),
          contentType: 'link',
          linkUrl: 'https://example.com',
        },
        overrideAccess: true,
      })
      expect(ok.linkUrl).toBe('https://example.com')
      const okInternal = await payload.create({
        collection: 'menus',
        data: {
          tenant: siteAId,
          name: marker('GoodInternal'),
          contentType: 'link',
          linkUrl: '/bos/home',
        },
        overrideAccess: true,
      })
      expect(okInternal.linkUrl).toBe('/bos/home')
    })

    it('scopes menus per tenant (cross-tenant denied)', async () => {
      const menuA = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: marker('ScopeA') },
        overrideAccess: true,
      })
      const menuB = await payload.create({
        collection: 'menus',
        data: { tenant: siteBId, name: marker('ScopeB') },
        overrideAccess: true,
      })

      // scopedA reads site A menus, not site B.
      const found = await payload.find({
        collection: 'menus',
        user: scopedAUser,
        overrideAccess: false,
        pagination: false,
        limit: 0,
      })
      const ids = found.docs.map((d) => d.id)
      expect(ids).toContain(menuA.id)
      expect(ids).not.toContain(menuB.id)

      // scopedA cannot create a menu on site B.
      await expect(
        payload.create({
          collection: 'menus',
          data: { tenant: siteBId, name: marker('CrossCreate') },
          user: scopedAUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  // ── web contents (versions + drafts + diff) ───────────────────────────────
  describe('web contents (versioning + diff)', () => {
    let webContentId: number
    let menuAId: number

    beforeAll(async () => {
      const menu = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: marker('WCMenu'), contentType: 'content' },
        overrideAccess: true,
      })
      menuAId = menu.id
      const created = await payload.create({
        collection: 'webContents',
        data: {
          menu: menuAId,
          name: 'wc',
          title: 'Version one title',
          content: lexical('First body.'),
        },
        overrideAccess: true,
      })
      webContentId = created.id
      // Second save → a new version.
      await payload.update({
        collection: 'webContents',
        id: webContentId,
        data: { title: 'Version two title', content: lexical('Second body revised.') },
        overrideAccess: true,
      })
    })

    it('derives tenant from the bound menu', async () => {
      const doc = await payload.findByID({
        collection: 'webContents',
        id: webContentId,
        overrideAccess: true,
      })
      expect(toRelationId(doc.tenant)).toBe(siteAId)
    })

    it('enforces the 1:1 menu binding (unique)', async () => {
      await expect(
        payload.create({
          collection: 'webContents',
          data: { menu: menuAId, title: 'dupe' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('creates a version on every save; restoring a prior version re-activates it', async () => {
      const versions = await payload.findVersions({
        collection: 'webContents',
        where: { parent: { equals: webContentId } },
        sort: 'createdAt',
        limit: 0,
        pagination: false,
        overrideAccess: true,
      })
      expect(versions.docs.length).toBeGreaterThanOrEqual(2)

      // The published (active) doc reflects the latest save.
      const current = await payload.findByID({
        collection: 'webContents',
        id: webContentId,
        overrideAccess: true,
      })
      expect(current.title).toBe('Version two title')

      // Restore the OLDEST version → it becomes the active document.
      const oldest = versions.docs[0]!
      await payload.restoreVersion({
        collection: 'webContents',
        id: oldest.id,
        overrideAccess: true,
      })
      const afterRestore = await payload.findByID({
        collection: 'webContents',
        id: webContentId,
        overrideAccess: true,
      })
      expect(afterRestore.title).toBe('Version one title')
    })

    it('diff endpoint: access-gated + shows the changed title field', async () => {
      // Self-contained: a fresh content with two clearly-distinct versions, so
      // the from/to selection is unambiguous regardless of other tests.
      const menu = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: marker('DiffMenu'), contentType: 'content' },
        overrideAccess: true,
      })
      const wc = await payload.create({
        collection: 'webContents',
        data: { menu: menu.id, title: 'DIFF-AAA', content: lexical('body a') },
        overrideAccess: true,
      })
      await payload.update({
        collection: 'webContents',
        id: wc.id,
        data: { title: 'DIFF-BBB', content: lexical('body b') },
        overrideAccess: true,
      })

      const versions = await payload.findVersions({
        collection: 'webContents',
        where: { parent: { equals: wc.id } },
        limit: 0,
        pagination: false,
        overrideAccess: true,
      })
      // Identify each version by its title, not by ordering.
      const fromV = versions.docs.find((v) => v.version.title === 'DIFF-AAA')!
      const toV = versions.docs.find((v) => v.version.title === 'DIFF-BBB')!
      expect(fromV).toBeTruthy()
      expect(toV).toBeTruthy()

      // Super user → 200 + a title diff marked changed.
      const okRes = await handleWebContentDiff({
        payload,
        user: superUser,
        id: wc.id,
        from: fromV.id,
        to: toV.id,
      })
      expect(okRes.status).toBe(200)
      const body = (await okRes.json()) as { diff: { field: string; changed: boolean }[] }
      const titleDiff = body.diff.find((d) => d.field === 'title')
      expect(titleDiff?.changed).toBe(true)

      // A user scoped to the OTHER site (B) is denied (403).
      const denied = await handleWebContentDiff({
        payload,
        user: scopedBUser,
        id: wc.id,
        from: fromV.id,
        to: toV.id,
      })
      expect(denied.status).toBe(403)
    })

    it('scopes web contents per tenant (cross-tenant create denied)', async () => {
      // A menu on site B — scopedA cannot bind content to it.
      const menuB = await payload.create({
        collection: 'menus',
        data: { tenant: siteBId, name: marker('WCMenuB'), contentType: 'content' },
        overrideAccess: true,
      })
      await expect(
        payload.create({
          collection: 'webContents',
          data: { menu: menuB.id, title: 'x' },
          user: scopedAUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  // ── short URLs + public redirect ──────────────────────────────────────────
  describe('short URLs + redirect', () => {
    it('auto-generates a unique immutable code and rejects a javascript originalUrl', async () => {
      const created = await payload.create({
        collection: 'shortUrls',
        data: { tenant: siteAId, linkName: marker('SU'), originalUrl: 'https://example.com/x' },
        overrideAccess: true,
      })
      expect(created.code).toMatch(/^[A-Za-z0-9]{8}$/)

      // Immutable: a non-override write cannot change the code.
      const patched = await payload.update({
        collection: 'shortUrls',
        id: created.id,
        data: { code: 'HACKED00' } as never,
        user: superUser,
        overrideAccess: false,
      })
      expect(patched.code).toBe(created.code)

      // A dangerous originalUrl is rejected on create.
      await expect(
        payload.create({
          collection: 'shortUrls',
          data: {
            tenant: siteAId,
            linkName: marker('BadSU'),
            originalUrl: 'javascript:alert(1)',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('302-redirects a known code to its target and bumps hitCount', async () => {
      const created = await payload.create({
        collection: 'shortUrls',
        data: {
          tenant: siteAId,
          linkName: marker('RedirectSU'),
          originalUrl: 'https://example.com/destination',
        },
        overrideAccess: true,
      })
      const res = await handleShortUrlRedirect({ payload, code: created.code as string })
      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('https://example.com/destination')

      const reloaded = await payload.findByID({
        collection: 'shortUrls',
        id: created.id,
        overrideAccess: true,
      })
      expect(reloaded.hitCount).toBe(1)
    })

    it('404s an unknown code', async () => {
      const res = await handleShortUrlRedirect({ payload, code: 'zzzzzzzz' })
      expect(res.status).toBe(404)
    })

    it('404s (never 302s) a tampered javascript: target — redirect re-validation', async () => {
      const created = await payload.create({
        collection: 'shortUrls',
        data: {
          tenant: siteAId,
          linkName: marker('TamperSU'),
          originalUrl: 'https://example.com/ok',
        },
        overrideAccess: true,
      })
      // Bypass the field validator by tampering the row directly, then prove the
      // redirect's own re-validation refuses to 302 to it.
      await payload.db.pool.query('UPDATE short_urls SET original_url = $1 WHERE id = $2', [
        'javascript:alert(1)',
        created.id,
      ])
      const res = await handleShortUrlRedirect({ payload, code: created.code as string })
      expect(res.status).toBe(404)
      expect(res.headers.get('Location')).toBeNull()
    })

    it('scopes short URLs per tenant (cross-tenant create denied)', async () => {
      await expect(
        payload.create({
          collection: 'shortUrls',
          data: {
            tenant: siteBId,
            linkName: marker('CrossSU'),
            originalUrl: 'https://x.example.com',
          },
          user: scopedAUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  // ── board post export endpoint (TODO 3.10) ────────────────────────────────
  describe('board post export', () => {
    let boardAId: number
    let postTitle: string

    beforeAll(async () => {
      const board = await payload.create({
        collection: 'boards',
        data: { tenant: siteAId, name: marker('ExportBoard'), boardType: photoTypeId },
        overrideAccess: true,
      })
      boardAId = board.id
      postTitle = marker('ExportablePost')
      await payload.create({
        collection: 'posts',
        data: { board: boardAId, title: postTitle, author: 'Exporter' },
        overrideAccess: true,
      })
    })

    it('super user exports a CSV containing the board’s posts', async () => {
      const res = await handleBoardExport({ payload, user: superUser, id: boardAId, params: {} })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/csv')
      const text = await res.text()
      expect(text).toContain(postTitle)
    })

    it('is access-gated + tenant-scoped: a user assigned to another site is denied (403)', async () => {
      const res = await handleBoardExport({ payload, user: scopedBUser, id: boardAId, params: {} })
      expect(res.status).toBe(403)
    })

    it('denies an unauthenticated export (403)', async () => {
      const res = await handleBoardExport({ payload, user: undefined, id: boardAId, params: {} })
      expect(res.status).toBe(403)
    })
  })

  // ── seeds ──────────────────────────────────────────────────────────────────
  describe('seeds', () => {
    it('seeds menus + a 2-version web content + a short URL + help entries idempotently', async () => {
      await runSeed(payload, [contentMenusStep])
      await runSeed(payload, [contentMenusStep])

      const demo = await payload.find({
        collection: 'sites',
        where: { siteId: { equals: 'demo' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const demoId = demo.docs[0]!.id

      const homeMenu = await payload.find({
        collection: 'menus',
        where: { and: [{ tenant: { equals: demoId } }, { name: { equals: SEED_MENU_HOME } }] },
        limit: 2,
        pagination: false,
        overrideAccess: true,
      })
      expect(homeMenu.docs).toHaveLength(1)

      const wc = await payload.find({
        collection: 'webContents',
        where: { menu: { equals: homeMenu.docs[0]!.id } },
        limit: 2,
        pagination: false,
        overrideAccess: true,
      })
      expect(wc.docs).toHaveLength(1)
      // The seeded content was saved twice → at least two versions.
      const wcVersions = await payload.findVersions({
        collection: 'webContents',
        where: { parent: { equals: wc.docs[0]!.id } },
        limit: 0,
        pagination: false,
        overrideAccess: true,
      })
      expect(wcVersions.docs.length).toBeGreaterThanOrEqual(2)

      const shortUrl = await payload.find({
        collection: 'shortUrls',
        where: {
          and: [{ tenant: { equals: demoId } }, { linkName: { equals: SEED_SHORTURL_NAME } }],
        },
        limit: 2,
        pagination: false,
        overrideAccess: true,
      })
      expect(shortUrl.docs).toHaveLength(1)

      const help = await payload.find({
        collection: 'helpEntries',
        where: { name: { equals: SEED_HELP_MENU } },
        limit: 2,
        pagination: false,
        overrideAccess: true,
      })
      expect(help.docs).toHaveLength(1)
    })
  })
})
