import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { getPublicSiteId } from '@/site/config'
import {
  getBanners,
  getGuideMenus,
  getNotificationAreas,
  getPopups,
  getSiteMenus,
  resolveBoardByBbsId,
  resolveContentPage,
  resolvePostForBoard,
  resolveSiteRecord,
} from '@/site/data'
import { runSeed } from '@/seed'
import { sitesStep } from '@/seed/steps/sites'
import { boardTypesStep } from '@/seed/steps/boardTypes'

let payload: Payload

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

function uniqueSiteId(label: string): string {
  return `t${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}

async function createMedia(payload: Payload, name: string): Promise<number> {
  const doc = await payload.create({
    collection: 'media',
    data: { alt: name },
    file: { data: PNG_1x1, name, mimetype: 'image/png', size: PNG_1x1.length },
    overrideAccess: true,
  })
  return doc.id
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

describe('public site data resolvers (Task 4A)', () => {
  let siteAId: number
  let siteBId: number
  let boardTypeId: number

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [sitesStep, boardTypesStep])

    const bt = await payload.find({
      collection: 'boardTypes',
      where: { code: { equals: 'PG0002' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    boardTypeId = bt.docs[0]!.id

    const siteA = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('pa'), name: 'Public A', url: 'https://pa.example.com' },
      overrideAccess: true,
    })
    const siteB = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('pb'), name: 'Public B', url: 'https://pb.example.com' },
      overrideAccess: true,
    })
    siteAId = siteA.id
    siteBId = siteB.id
  })

  describe('resolveSiteRecord', () => {
    it('resolves the seeded demo user-facing site', async () => {
      const site = await resolveSiteRecord(payload, 'demo')
      expect(site).not.toBeNull()
      expect(site?.siteId).toBe('demo')
      expect(site?.isAdminSite).toBeFalsy()
    })

    it('defaults (env seam) to the demo public site', async () => {
      const site = await resolveSiteRecord(payload)
      expect(site?.siteId).toBe(getPublicSiteId())
    })

    it('never serves the admin (bos) site as a public site', async () => {
      expect(await resolveSiteRecord(payload, 'bos')).toBeNull()
    })

    it('returns null for an unknown siteId', async () => {
      expect(await resolveSiteRecord(payload, 'nosuchsite')).toBeNull()
    })
  })

  describe('getSiteMenus + getGuideMenus (tenant-scoped)', () => {
    it('returns only the queried site’s menus and guide menus', async () => {
      await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: 'A Home', contentType: 'placeholder' },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'menus',
        data: { tenant: siteBId, name: 'B Home', contentType: 'placeholder' },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'guideMenus',
        data: {
          tenant: siteAId,
          position: 'top',
          name: 'A Guide',
          linkType: 'external',
          linkExternal: 'https://x.io',
        },
        overrideAccess: true,
      })

      const aMenus = await getSiteMenus(payload, siteAId)
      expect(aMenus.every((m) => String(toId(m.tenant)) === String(siteAId))).toBe(true)
      expect(aMenus.some((m) => m.name === 'A Home')).toBe(true)
      expect(aMenus.some((m) => m.name === 'B Home')).toBe(false)

      const aTop = await getGuideMenus(payload, siteAId, 'top')
      expect(aTop.some((g) => g.name === 'A Guide')).toBe(true)
      const aBottom = await getGuideMenus(payload, siteAId, 'bottom')
      expect(aBottom.some((g) => g.name === 'A Guide')).toBe(false)
    })
  })

  describe('getBanners + getNotificationAreas + getPopups (tenant-scoped, Task 4E)', () => {
    it('returns only the queried site’s rows, with `image` populated to a Media doc', async () => {
      const imageId = await createMedia(payload, `${uniqueSiteId('img')}.png`)

      await payload.create({
        collection: 'banners',
        data: { tenant: siteAId, image: imageId, title: 'A Banner' },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'banners',
        data: { tenant: siteBId, image: imageId, title: 'B Banner' },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'notificationAreas',
        data: { tenant: siteAId, image: imageId, title: 'A Notification' },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'popups',
        data: { tenant: siteAId, image: imageId, title: 'A Popup' },
        overrideAccess: true,
      })

      const aBanners = await getBanners(payload, siteAId)
      expect(aBanners.some((b) => b.title === 'A Banner')).toBe(true)
      expect(aBanners.some((b) => b.title === 'B Banner')).toBe(false)
      const populatedImage = aBanners.find((b) => b.title === 'A Banner')?.image
      expect(typeof populatedImage === 'object' && populatedImage?.url).toBeTruthy()

      const aAreas = await getNotificationAreas(payload, siteAId)
      expect(aAreas.some((a) => a.title === 'A Notification')).toBe(true)

      const aPopups = await getPopups(payload, siteAId)
      expect(aPopups.some((p) => p.title === 'A Popup')).toBe(true)

      // Cross-tenant isolation on the other two collections too.
      expect(
        (await getNotificationAreas(payload, siteBId)).some((a) => a.title === 'A Notification'),
      ).toBe(false)
      expect((await getPopups(payload, siteBId)).some((p) => p.title === 'A Popup')).toBe(false)
    })
  })

  describe('resolveContentPage (/page/[menuNumber])', () => {
    it('resolves a content menu with published web content on the same site', async () => {
      const menu = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: 'A Content', contentType: 'content' },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'webContents',
        // PUBLISH so the public read resolves it (B3: only published content is
        // served — an unpublished draft returns null / 404).
        data: {
          menu: menu.id,
          name: 'a',
          title: 'A Title',
          content: lexical('body'),
          _status: 'published',
        } as never,
        overrideAccess: true,
      })

      const resolved = await resolveContentPage(payload, siteAId, menu.menuNumber!)
      expect(resolved).not.toBeNull()
      expect(resolved?.content.title).toBe('A Title')
      expect(String(toId(resolved?.menu.tenant))).toBe(String(siteAId))

      // Same number, other site → not found (tenant isolation).
      expect(await resolveContentPage(payload, siteBId, menu.menuNumber!)).toBeNull()
      // Unknown number → not found.
      expect(await resolveContentPage(payload, siteAId, 9_999_999)).toBeNull()
    })

    it('404s for a non-content menu, an inactive menu, and an unbound content menu', async () => {
      const link = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: 'A Link', contentType: 'link', linkUrl: 'https://x.io' },
        overrideAccess: true,
      })
      expect(await resolveContentPage(payload, siteAId, link.menuNumber!)).toBeNull()

      const inactive = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: 'A Inactive', contentType: 'content', active: false },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'webContents',
        data: { menu: inactive.id, title: 'Hidden', content: lexical('x') },
        overrideAccess: true,
      })
      expect(await resolveContentPage(payload, siteAId, inactive.menuNumber!)).toBeNull()

      const unbound = await payload.create({
        collection: 'menus',
        data: { tenant: siteAId, name: 'A Unbound', contentType: 'content' },
        overrideAccess: true,
      })
      expect(await resolveContentPage(payload, siteAId, unbound.menuNumber!)).toBeNull()
    })
  })

  describe('resolveBoardByBbsId (/board/[bbsId])', () => {
    it('resolves a board on the same site and 404s cross-site / unknown', async () => {
      const board = await payload.create({
        collection: 'boards',
        data: { tenant: siteAId, name: 'A Board', boardType: boardTypeId },
        overrideAccess: true,
      })
      const bbsId = board.bbsId!

      const resolved = await resolveBoardByBbsId(payload, siteAId, bbsId)
      expect(resolved?.id).toBe(board.id)
      expect(await resolveBoardByBbsId(payload, siteBId, bbsId)).toBeNull()
      expect(await resolveBoardByBbsId(payload, siteAId, 'B9999999')).toBeNull()
    })
  })

  describe('resolvePostForBoard (/board/[bbsId]/[postId])', () => {
    it('resolves a post within its board and 404s for mismatches and secrets', async () => {
      const board = await payload.create({
        collection: 'boards',
        data: {
          tenant: siteAId,
          name: 'Post Board',
          boardType: boardTypeId,
          secretPostAllowed: true,
          fields: [{ fieldKey: 'title', useFlag: true, requiredFlag: true, inputType: 'text' }],
        },
        overrideAccess: true,
      })
      const otherBoard = await payload.create({
        collection: 'boards',
        data: { tenant: siteAId, name: 'Other Board', boardType: boardTypeId },
        overrideAccess: true,
      })
      const post = await payload.create({
        collection: 'posts',
        data: { board: board.id, title: 'Hello' },
        overrideAccess: true,
      })
      const secret = await payload.create({
        collection: 'posts',
        data: { board: board.id, title: 'Secret', isSecret: true },
        overrideAccess: true,
      })

      const resolved = await resolvePostForBoard(payload, siteAId, board.bbsId!, post.id)
      expect(resolved?.post.id).toBe(post.id)
      expect(resolved?.board.id).toBe(board.id)

      // Board not on the queried site → 404.
      expect(await resolvePostForBoard(payload, siteBId, board.bbsId!, post.id)).toBeNull()
      // Post belongs to a different board → 404.
      expect(await resolvePostForBoard(payload, siteAId, otherBoard.bbsId!, post.id)).toBeNull()
      // Unknown post id → 404.
      expect(await resolvePostForBoard(payload, siteAId, board.bbsId!, 99_999_999)).toBeNull()
      // Secret post → 404 (conservative until T4C member gating).
      expect(await resolvePostForBoard(payload, siteAId, board.bbsId!, secret.id)).toBeNull()
    })
  })
})

/** Normalizes a relationship (id or populated doc) to its id. */
function toId(rel: unknown): number | string | undefined {
  if (rel && typeof rel === 'object') {
    return (rel as { id?: number | string }).id
  }
  return rel as number | string | undefined
}
