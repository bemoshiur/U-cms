import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { canDownloadPost, handleFileDownload } from '@/endpoints/fileDownload'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { boardTypesStep } from '@/seed/steps/boardTypes'
import { sitesStep } from '@/seed/steps/sites'
import { classifyAdminPath } from '@/security/adminIpEnforcement'

/**
 * Task 4-zero — board/post attachment confidentiality (phase-3-final-review
 * §2-B2 full fix). Every acceptance criterion below is an assertion that FAILS
 * without the fix (i.e. if attachments still lived in the public `media` pool
 * with `read: () => true` and an IP-exempt file route):
 *
 *  1. Cross-tenant denial — a Site-B admin cannot list/fetch a Site-A
 *     attachment (secret or not) by id, filename-route, or download endpoint.
 *  2. Secret denial — a secret post's attachment is unreachable to a user who
 *     can't view the post (non-author, non-tenant-admin) by any route.
 *  3. Authorized access — the owning-tenant admin / author / super CAN fetch
 *     via /api/files/download, and the counter still increments.
 *  5. Unauthenticated — nothing is fetchable with no session by any route.
 *  6. One sanctioned path — the raw attachment file route is GUARDED (not
 *     IP-exempt); only /api/files/download (canDownloadPost) is sanctioned.
 *
 * The raw `/api/attachments/file/<name>` route runs the SAME collection `read`
 * access as a read-by-id, so a denied `findByID` proves the file route denies
 * too (the pattern the B2 interim test established).
 */

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

describe('Task 4-zero: attachment confidentiality (cross-tenant + secret + unauth)', () => {
  let siteAId: number
  let siteBId: number
  let boardTypeId: number
  let attNonSecretId: number
  let attNonSecretFilename: string
  let attSecretId: number
  let nonSecretPostId: number
  let secretPostId: number

  let adminA: Awaited<ReturnType<typeof payload.create>> // Site A, content.posts
  let adminB: Awaited<ReturnType<typeof payload.create>> // Site B, content.posts
  let noTenantUser: Awaited<ReturnType<typeof payload.create>> // content.posts, no tenant
  let superUser: Awaited<ReturnType<typeof payload.create>>

  async function createAttachment(name: string, tenantId: number): Promise<number> {
    const doc = await payload.create({
      collection: 'attachments',
      data: { alt: name, tenant: tenantId } as never,
      file: { data: PNG_1x1, name, mimetype: 'image/png', size: PNG_1x1.length },
      overrideAccess: true,
    })
    return doc.id
  }

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])

    const boardTypes = await payload.find({
      collection: 'boardTypes',
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    boardTypeId = boardTypes.docs[0]!.id

    const siteA = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('aa'), name: 'Attach A', url: 'https://aa.example.com' },
      overrideAccess: true,
    })
    const siteB = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('bb'), name: 'Attach B', url: 'https://bb.example.com' },
      overrideAccess: true,
    })
    siteAId = siteA.id
    siteBId = siteB.id

    const postsMenu = await payload.find({
      collection: 'adminMenus',
      where: { menuKey: { equals: 'content.posts' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const postsMenuId = postsMenu.docs[0]!.id
    const postsRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_ATT_POSTS_${Date.now()}`,
        name: 'Attach posts role',
        description: 'content.posts only.',
        menuGrants: [postsMenuId],
      },
      overrideAccess: true,
    })
    const superRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_ATT_SUPER_${Date.now()}`,
        name: 'Attach super role',
        description: 'isSuper.',
        isSuper: true,
      },
      overrideAccess: true,
    })

    adminA = await payload.create({
      collection: 'users',
      data: {
        email: `att-a-${Date.now()}@example.com`,
        password: TEST_PASSWORD,
        roles: [postsRole.id],
        tenants: [{ tenant: siteAId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    adminB = await payload.create({
      collection: 'users',
      data: {
        email: `att-b-${Date.now()}@example.com`,
        password: TEST_PASSWORD,
        roles: [postsRole.id],
        tenants: [{ tenant: siteBId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    noTenantUser = await payload.create({
      collection: 'users',
      data: {
        email: `att-nt-${Date.now()}@example.com`,
        password: TEST_PASSWORD,
        roles: [postsRole.id],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    superUser = await payload.create({
      collection: 'users',
      data: {
        email: `att-su-${Date.now()}@example.com`,
        password: TEST_PASSWORD,
        roles: [superRole.id],
        status: 'active',
      },
      overrideAccess: true,
    })

    const boardA = await payload.create({
      collection: 'boards',
      data: {
        tenant: siteAId,
        name: marker('AttBoardA'),
        boardType: boardTypeId,
        attachmentsEnabled: true,
        attachmentMaxCount: 3,
      },
      overrideAccess: true,
    })

    attNonSecretId = await createAttachment(`${marker('public-att')}.png`, siteAId)
    attSecretId = await createAttachment(`${marker('secret-att')}.png`, siteAId)
    attNonSecretFilename = (await payload
      .findByID({
        collection: 'attachments',
        id: attNonSecretId,
        overrideAccess: true,
      })
      .then((d) => d.filename)) as string

    const nonSecretPost = await payload.create({
      collection: 'posts',
      data: {
        board: boardA.id,
        title: marker('NonSecretWithFile'),
        attachments: [{ media: attNonSecretId, description: 'public board file' }],
      },
      overrideAccess: true,
    })
    nonSecretPostId = nonSecretPost.id

    const secretPost = await payload.create({
      collection: 'posts',
      data: {
        board: boardA.id,
        title: marker('SecretWithFile'),
        isSecret: true,
        attachments: [{ media: attSecretId, description: 'secret board file' }],
      },
      overrideAccess: true,
    })
    secretPostId = secretPost.id
  })

  // ── Criterion 1: cross-tenant denial (incl. NON-secret) ───────────────────
  describe('cross-tenant denial (criterion 1)', () => {
    it('a Site-B admin does NOT see a Site-A attachment in the collection list', async () => {
      const list = await payload.find({
        collection: 'attachments',
        overrideAccess: false,
        user: adminB,
        limit: 0,
        pagination: false,
      })
      expect(list.docs.map((d) => d.id)).not.toContain(attNonSecretId)
      expect(list.docs.map((d) => d.id)).not.toContain(attSecretId)
    })

    it('a Site-B admin cannot read a Site-A attachment by id (proves the file route too)', async () => {
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: attNonSecretId,
          overrideAccess: false,
          user: adminB,
        }),
      ).rejects.toThrow()
    })

    it('a Site-B admin cannot download a Site-A (non-secret) attachment', async () => {
      const res = await handleFileDownload({
        payload,
        user: adminB,
        postId: String(nonSecretPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(403)
    })
  })

  // ── Criterion 2: secret denial for a non-viewer ───────────────────────────
  describe('secret denial (criterion 2)', () => {
    it('a cross-tenant admin cannot download a secret post attachment', async () => {
      expect(
        await canDownloadPost({
          payload,
          user: adminB,
          post: { id: secretPostId, tenant: siteAId },
        }),
      ).toBe(false)
      const res = await handleFileDownload({
        payload,
        user: adminB,
        postId: String(secretPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(403)
    })

    it('an authenticated user with the posts grant but NO tenant cannot read or download it', async () => {
      // Non-author, non-tenant-admin: has content.posts but is assigned to no
      // site, so tenant scoping denies the raw read and canDownloadPost denies
      // the download.
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: attSecretId,
          overrideAccess: false,
          user: noTenantUser,
        }),
      ).rejects.toThrow()
      const res = await handleFileDownload({
        payload,
        user: noTenantUser,
        postId: String(secretPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(403)
    })
  })

  // ── Criterion 3: authorized access still works ────────────────────────────
  describe('authorized access + counter (criterion 3)', () => {
    it('the owning-tenant admin can read the attachment doc and download it', async () => {
      const byId = await payload.findByID({
        collection: 'attachments',
        id: attNonSecretId,
        overrideAccess: false,
        user: adminA,
      })
      expect(byId.id).toBe(attNonSecretId)

      const res = await handleFileDownload({
        payload,
        user: adminA,
        postId: String(nonSecretPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-disposition')).toContain('attachment')
    })

    it('super can download a SECRET post attachment and the counter increments', async () => {
      const before = await payload.findByID({
        collection: 'posts',
        id: secretPostId,
        overrideAccess: true,
      })
      const startCount = before.attachments?.[0]?.downloadCount ?? 0

      const res = await handleFileDownload({
        payload,
        user: superUser,
        postId: String(secretPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(200)

      const after = await payload.findByID({
        collection: 'posts',
        id: secretPostId,
        overrideAccess: true,
      })
      expect(after.attachments?.[0]?.downloadCount).toBe(startCount + 1)
    })
  })

  // ── Criterion 5: unauthenticated denial (any route) ───────────────────────
  describe('unauthenticated denial (criterion 5)', () => {
    it('an anonymous collection list is refused', async () => {
      await expect(
        payload.find({
          collection: 'attachments',
          overrideAccess: false,
          limit: 0,
          pagination: false,
        }),
      ).rejects.toThrow()
    })

    it('an anonymous read-by-id is refused (proves the file route denies anon)', async () => {
      await expect(
        payload.findByID({ collection: 'attachments', id: attNonSecretId, overrideAccess: false }),
      ).rejects.toThrow()
    })

    it('an anonymous download is refused', async () => {
      const res = await handleFileDownload({
        payload,
        user: null,
        postId: String(nonSecretPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(403)
    })
  })

  // ── Criterion 6: one sanctioned path — raw attachment routes stay guarded ──
  describe('one sanctioned fetch path (criterion 6)', () => {
    it('the raw attachment file route is GUARDED (not IP-exempt); media file route is exempt', () => {
      expect(classifyAdminPath(`/api/attachments/file/${attNonSecretFilename}`)).toBe('guard')
      expect(classifyAdminPath('/api/attachments')).toBe('guard')
      expect(classifyAdminPath(`/api/attachments/${attNonSecretId}`)).toBe('guard')
      // The ONLY public file route is the media pool (public logos) — never attachments.
      expect(classifyAdminPath('/api/media/file/logo.png')).toBe('exempt')
    })
  })
})
