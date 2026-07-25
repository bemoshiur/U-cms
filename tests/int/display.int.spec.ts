import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { compareAdminNotices } from '@/content/display'
import { MAX_TOP_GUIDE_MENUS } from '@/collections/display/GuideMenus'
import { ADMIN_NOTICE_MAX_ATTACHMENTS } from '@/collections/display/AdminNotices'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import {
  displayComponentsStep,
  SEED_ADMIN_NOTICE_TITLE,
  SEED_BANNER_TITLE,
  SEED_GUIDE_MENUS,
  SEED_NOTIFICATION_TITLE,
  SEED_POPUP_TITLE,
} from '@/seed/steps/displayComponents'

let payload: Payload

const TEST_PASSWORD = 'a-long-enough-test-password-1'
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

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

async function createMedia(name: string, mimetype = 'image/png'): Promise<number> {
  const doc = await payload.create({
    collection: 'media',
    data: { alt: name },
    file: { data: PNG_1x1, name, mimetype, size: PNG_1x1.length },
    overrideAccess: true,
  })
  return doc.id
}

const DISPLAY_MENU_KEYS = [
  'content.notificationAreas',
  'content.popups',
  'content.banners',
  'content.adminNotices',
  'content.guideMenus',
]

describe('per-site display components (Task 3C)', () => {
  let siteAId: number
  let siteBId: number
  let imageId: number

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    // Admin menus (for the display menu grants) + the bos/demo sites (seed).
    await runSeed(payload, [adminMenusStep, sitesStep])

    const siteA = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('da'), name: 'Display A', url: 'https://da.example.com' },
      overrideAccess: true,
    })
    const siteB = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('db'), name: 'Display B', url: 'https://db.example.com' },
      overrideAccess: true,
    })
    siteAId = siteA.id
    siteBId = siteB.id
    imageId = await createMedia(`${marker('img')}.png`)
  })

  // ── external-link http validation (shared field-set) ──────────────────────
  describe('external-link http validation', () => {
    it('rejects a notification area with an external link that is not http(s)', async () => {
      await expect(
        payload.create({
          collection: 'notificationAreas',
          data: {
            tenant: siteAId,
            image: imageId,
            title: marker('BadLink'),
            linkType: 'external',
            linkExternal: '/relative/path',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('accepts a banner with a valid https external link', async () => {
      const created = await payload.create({
        collection: 'banners',
        data: {
          tenant: siteAId,
          image: imageId,
          title: marker('GoodLink'),
          linkType: 'external',
          linkExternal: 'https://example.com/promo',
        },
        overrideAccess: true,
      })
      expect(created.linkExternal).toBe('https://example.com/promo')
    })

    it('rejects a guide menu whose external link omits http', async () => {
      await expect(
        payload.create({
          collection: 'guideMenus',
          data: {
            tenant: siteAId,
            position: 'bottom',
            name: marker('BadGuide'),
            linkType: 'external',
            linkExternal: 'example.com',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('does not require an external URL when the link is internal', async () => {
      const created = await payload.create({
        collection: 'notificationAreas',
        data: {
          tenant: siteAId,
          image: imageId,
          title: marker('Internal'),
          linkType: 'internal',
          linkInternal: '/bos/home',
        },
        overrideAccess: true,
      })
      expect(created.linkInternal).toBe('/bos/home')
    })
  })

  // ── image is required for the image-bearing collections ───────────────────
  describe('image requirement', () => {
    it('rejects a popup without an image', async () => {
      await expect(
        payload.create({
          collection: 'popups',
          data: { tenant: siteAId, title: marker('NoImage') } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })
  })

  // ── max-5-top guide menus per site ────────────────────────────────────────
  describe('max top guide menus (per site)', () => {
    it(`allows ${MAX_TOP_GUIDE_MENUS} top menus and rejects a 6th on the same site`, async () => {
      const topSite = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('top'), name: 'Top site', url: 'https://top.example.com' },
        overrideAccess: true,
      })
      for (let i = 0; i < MAX_TOP_GUIDE_MENUS; i++) {
        await payload.create({
          collection: 'guideMenus',
          data: {
            tenant: topSite.id,
            position: 'top',
            name: marker(`Top${i}`),
            linkType: 'internal',
            linkInternal: '/x',
          },
          overrideAccess: true,
        })
      }
      await expect(
        payload.create({
          collection: 'guideMenus',
          data: {
            tenant: topSite.id,
            position: 'top',
            name: marker('Top6'),
            linkType: 'internal',
            linkInternal: '/x',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()

      // Bottom menus are unbounded on the same site.
      const bottom = await payload.create({
        collection: 'guideMenus',
        data: {
          tenant: topSite.id,
          position: 'bottom',
          name: marker('Bottom'),
          linkType: 'internal',
          linkInternal: '/x',
        },
        overrideAccess: true,
      })
      expect(bottom.id).toBeDefined()

      // The limit is PER SITE — a different site can still add top menus.
      const otherSiteTop = await payload.create({
        collection: 'guideMenus',
        data: {
          tenant: siteBId,
          position: 'top',
          name: marker('OtherTop'),
          linkType: 'internal',
          linkInternal: '/x',
        },
        overrideAccess: true,
      })
      expect(otherSiteTop.id).toBeDefined()
    })
  })

  // ── admin notices: pinned above general + max attachments ─────────────────
  describe('admin notices', () => {
    it('sorts pinned notices above general ones (compareAdminNotices)', async () => {
      const noticeSite = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('an'), name: 'Notice site', url: 'https://an.example.com' },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'adminNotices',
        data: { tenant: noticeSite.id, noticeType: 'general', title: marker('General') },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'adminNotices',
        data: {
          tenant: noticeSite.id,
          noticeType: 'pinned',
          title: marker('Pinned'),
          pinFrom: '2026-07-01T00:00:00Z',
          pinTo: '2026-12-31T00:00:00Z',
        },
        overrideAccess: true,
      })

      const found = await payload.find({
        collection: 'adminNotices',
        where: { tenant: { equals: noticeSite.id } },
        pagination: false,
        limit: 0,
        overrideAccess: true,
      })
      const sorted = [...found.docs].sort(compareAdminNotices)
      expect(sorted[0]?.noticeType).toBe('pinned')
      expect(sorted[sorted.length - 1]?.noticeType).toBe('general')
    })

    it(`rejects more than ${ADMIN_NOTICE_MAX_ATTACHMENTS} attachments`, async () => {
      const media = await Promise.all(
        Array.from({ length: ADMIN_NOTICE_MAX_ATTACHMENTS + 1 }, (_i, n) =>
          createMedia(`${marker('att')}-${n}.png`),
        ),
      )
      await expect(
        payload.create({
          collection: 'adminNotices',
          data: {
            tenant: siteAId,
            noticeType: 'general',
            title: marker('TooManyAtt'),
            attachments: media.map((m) => ({ media: m })),
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('accepts up to the max attachments and rejects a disallowed extension', async () => {
      const png = await createMedia(`${marker('ok')}.png`)
      const ok = await payload.create({
        collection: 'adminNotices',
        data: {
          tenant: siteAId,
          noticeType: 'general',
          title: marker('OkAtt'),
          attachments: [{ media: png, description: 'an image' }],
        },
        overrideAccess: true,
      })
      expect(ok.attachments?.length).toBe(1)

      const pdf = await createMedia(`${marker('bad')}.pdf`, 'application/pdf')
      await expect(
        payload.create({
          collection: 'adminNotices',
          data: {
            tenant: siteAId,
            noticeType: 'general',
            title: marker('BadExtAtt'),
            attachments: [{ media: pdf }],
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })
  })

  // ── active toggle + exposure hour precision ───────────────────────────────
  describe('active toggle + exposure hour precision', () => {
    it('toggles the active flag via a partial update', async () => {
      const created = await payload.create({
        collection: 'notificationAreas',
        data: { tenant: siteAId, image: imageId, title: marker('Toggle'), active: true },
        overrideAccess: true,
      })
      expect(created.active).toBe(true)
      const updated = await payload.update({
        collection: 'notificationAreas',
        id: created.id,
        data: { active: false },
        overrideAccess: true,
      })
      expect(updated.active).toBe(false)
      const reloaded = await payload.findByID({
        collection: 'notificationAreas',
        id: created.id,
        overrideAccess: true,
      })
      expect(reloaded.active).toBe(false)
    })

    it('persists the exposure window at hour precision', async () => {
      const from = '2026-07-02T15:00:00.000Z'
      const to = '2026-07-09T18:00:00.000Z'
      const created = await payload.create({
        collection: 'banners',
        data: {
          tenant: siteAId,
          image: imageId,
          title: marker('Hours'),
          exposeFrom: from,
          exposeTo: to,
        },
        overrideAccess: true,
      })
      const reloaded = await payload.findByID({
        collection: 'banners',
        id: created.id,
        overrideAccess: true,
      })
      expect(new Date(reloaded.exposeFrom as string).getUTCHours()).toBe(15)
      expect(new Date(reloaded.exposeTo as string).getUTCHours()).toBe(18)
    })
  })

  // ── tenant scoping on EACH collection (boards pattern) ─────────────────────
  describe('tenant scoping (per-user, overrideAccess:false)', () => {
    let scopedUserA: Awaited<ReturnType<typeof payload.create>>
    let scopedUserB: Awaited<ReturnType<typeof payload.create>>

    beforeAll(async () => {
      const menus = await payload.find({
        collection: 'adminMenus',
        where: { menuKey: { in: DISPLAY_MENU_KEYS } },
        pagination: false,
        limit: 0,
        overrideAccess: true,
      })
      const menuIds = menus.docs.map((d) => d.id)
      expect(menuIds.length).toBe(DISPLAY_MENU_KEYS.length)

      const role = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_DISPLAY_${lettersOnly().toUpperCase()}`,
          name: 'Display-only test role',
          description: 'Grants all content.* display menus (non-super).',
          menuGrants: menuIds,
        },
        overrideAccess: true,
      })
      scopedUserA = await payload.create({
        collection: 'users',
        data: {
          email: `da-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          roles: [role.id],
          tenants: [{ tenant: siteAId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      scopedUserB = await payload.create({
        collection: 'users',
        data: {
          email: `db-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          roles: [role.id],
          tenants: [{ tenant: siteBId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
    })

    const cases: {
      collection: 'notificationAreas' | 'popups' | 'banners' | 'adminNotices' | 'guideMenus'
      make: (tenant: number) => Record<string, unknown>
    }[] = [
      {
        collection: 'notificationAreas',
        make: (tenant) => ({ tenant, image: imageId, title: marker('N') }),
      },
      {
        collection: 'popups',
        make: (tenant) => ({ tenant, image: imageId, title: marker('P') }),
      },
      {
        collection: 'banners',
        make: (tenant) => ({ tenant, image: imageId, title: marker('B') }),
      },
      {
        collection: 'adminNotices',
        make: (tenant) => ({ tenant, noticeType: 'general', title: marker('AN') }),
      },
      {
        collection: 'guideMenus',
        make: (tenant) => ({
          tenant,
          position: 'bottom',
          name: marker('G'),
          linkType: 'internal',
          linkInternal: '/x',
        }),
      },
    ]

    for (const { collection, make } of cases) {
      it(`${collection}: cross-tenant create denied + read filtered`, async () => {
        // A doc on site B (system write).
        const bDoc = await payload.create({
          collection,
          data: make(siteBId) as never,
          overrideAccess: true,
        })
        // userA (site A) creates on their own site.
        const aDoc = await payload.create({
          collection,
          data: make(siteAId) as never,
          user: scopedUserA,
          overrideAccess: false,
        })
        expect(aDoc.id).toBeDefined()
        // userB (site B) is DENIED creating on site A.
        await expect(
          payload.create({
            collection,
            data: make(siteAId) as never,
            user: scopedUserB,
            overrideAccess: false,
          }),
        ).rejects.toThrow()
        // userA's list includes their doc but not site B's.
        const list = await payload.find({
          collection,
          user: scopedUserA,
          overrideAccess: false,
          pagination: false,
          limit: 0,
        })
        const ids = list.docs.map((d) => d.id)
        expect(ids).toContain(aDoc.id)
        expect(ids).not.toContain(bDoc.id)
        // userA is DENIED reading a specific site B doc.
        await expect(
          payload.findByID({ collection, id: bDoc.id, user: scopedUserA, overrideAccess: false }),
        ).rejects.toThrow()
      })
    }
  })

  // ── seeds idempotent ──────────────────────────────────────────────────────
  describe('seeds', () => {
    it('seeds the display components idempotently on the right sites', async () => {
      await runSeed(payload, [displayComponentsStep])
      await runSeed(payload, [displayComponentsStep])

      const demo = await payload.find({
        collection: 'sites',
        where: { siteId: { equals: 'demo' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const bos = await payload.find({
        collection: 'sites',
        where: { siteId: { equals: 'bos' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const demoId = demo.docs[0]!.id
      const bosId = bos.docs[0]!.id

      const expectOne = async (
        collection: 'notificationAreas' | 'popups' | 'banners' | 'adminNotices',
        tenantId: number,
        title: string,
      ) => {
        const found = await payload.find({
          collection,
          where: { and: [{ tenant: { equals: tenantId } }, { title: { equals: title } }] },
          limit: 2,
          pagination: false,
          overrideAccess: true,
        })
        expect(found.docs).toHaveLength(1)
      }

      await expectOne('notificationAreas', demoId, SEED_NOTIFICATION_TITLE)
      await expectOne('popups', demoId, SEED_POPUP_TITLE)
      await expectOne('banners', demoId, SEED_BANNER_TITLE)
      await expectOne('adminNotices', bosId, SEED_ADMIN_NOTICE_TITLE)

      for (const menu of SEED_GUIDE_MENUS) {
        const found = await payload.find({
          collection: 'guideMenus',
          where: { and: [{ tenant: { equals: bosId } }, { name: { equals: menu.name } }] },
          limit: 2,
          pagination: false,
          overrideAccess: true,
        })
        expect(found.docs).toHaveLength(1)
        expect(found.docs[0]?.position).toBe(menu.position)
      }
    })
  })
})
