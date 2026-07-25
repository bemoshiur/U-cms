import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { canDownloadPost, handleFileDownload } from '@/endpoints/fileDownload'
import { classifyAdminPath } from '@/security/adminIpEnforcement'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { boardTypesStep } from '@/seed/steps/boardTypes'
import { sitesStep } from '@/seed/steps/sites'

/**
 * Task 4B Part 4 — the two carried Phase-3 member-posting seams:
 *  - D4: Q&A `answer`/`answeredBy`/`answeredAt` are admin-only + auto-stamped
 *    (forgery blocked).
 *  - seam #4: `canDownloadPost` opens a MEMBER branch (non-secret only) while
 *    anonymous + secret + cross-tenant stay denied, and `/api/files/download` is
 *    IP-guard-exempt.
 */

let payload: Payload

const TEST_PW = 'a-long-enough-test-password-1'
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

describe('Task 4B seams: D4 answer attribution + member download branch', () => {
  let siteId: number
  let siteBId: number
  let adminA: Awaited<ReturnType<typeof payload.create>>
  let otherAdmin: Awaited<ReturnType<typeof payload.create>>
  let member: Awaited<ReturnType<typeof payload.create>>
  let qnaPostId: number
  let nonSecretPostId: number
  let secretPostId: number
  let nonSecretPostBId: number
  let bosPostId: number

  async function createAttachment(name: string, tenant: number): Promise<number> {
    const doc = await payload.create({
      collection: 'attachments',
      data: { alt: name, tenant } as never,
      file: { data: PNG_1x1, name, mimetype: 'image/png', size: PNG_1x1.length },
      overrideAccess: true,
    })
    return doc.id
  }

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])

    const site = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('mp'), name: 'Member Post Site', url: 'https://mp.example.com' },
      overrideAccess: true,
    })
    siteId = site.id

    const boardTypes = await payload.find({
      collection: 'boardTypes',
      pagination: false,
      overrideAccess: true,
    })
    const qnaType = boardTypes.docs.find((b) => b.kind === 'qna') ?? boardTypes.docs[0]!

    const postsMenu = await payload.find({
      collection: 'adminMenus',
      where: { menuKey: { equals: 'content.posts' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const postsRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_MP_POSTS_${Date.now()}`,
        name: 'MP posts role',
        description: 'content.posts only.',
        menuGrants: [postsMenu.docs[0]!.id],
      },
      overrideAccess: true,
    })

    adminA = await payload.create({
      collection: 'users',
      data: {
        email: `mp-a-${Date.now()}@example.com`,
        password: TEST_PW,
        roles: [postsRole.id],
        tenants: [{ tenant: siteId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    otherAdmin = await payload.create({
      collection: 'users',
      data: {
        email: `mp-o-${Date.now()}@example.com`,
        password: TEST_PW,
        roles: [postsRole.id],
        tenants: [{ tenant: siteId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    member = await payload.create({
      collection: 'members',
      data: {
        loginId: `mp-member-${Date.now()}`.toLowerCase(),
        email: `mp-m-${Date.now()}@example.com`,
        name: 'Post Member',
        password: 'Member-Pass-99',
        status: 'active',
        tenant: siteId,
      } as never,
      overrideAccess: true,
    })

    const qnaBoard = await payload.create({
      collection: 'boards',
      data: { tenant: siteId, name: marker('QnaBoard'), boardType: qnaType.id },
      overrideAccess: true,
    })
    const attBoard = await payload.create({
      collection: 'boards',
      data: {
        tenant: siteId,
        name: marker('AttBoard'),
        boardType: qnaType.id,
        attachmentsEnabled: true,
        attachmentMaxCount: 3,
      },
      overrideAccess: true,
    })

    const qnaPost = await payload.create({
      collection: 'posts',
      data: { board: qnaBoard.id, title: marker('Question') },
      overrideAccess: true,
    })
    qnaPostId = qnaPost.id

    const attNonSecret = await createAttachment(`${marker('pub')}.png`, siteId)
    const attSecret = await createAttachment(`${marker('sec')}.png`, siteId)
    const nonSecretPost = await payload.create({
      collection: 'posts',
      data: {
        board: attBoard.id,
        title: marker('PublicFile'),
        attachments: [{ media: attNonSecret, description: 'public' }],
      },
      overrideAccess: true,
    })
    nonSecretPostId = nonSecretPost.id
    const secretPost = await payload.create({
      collection: 'posts',
      data: {
        board: attBoard.id,
        title: marker('SecretFile'),
        isSecret: true,
        attachments: [{ media: attSecret, description: 'secret' }],
      },
      overrideAccess: true,
    })
    secretPostId = secretPost.id

    // ── Cross-tenant targets (C1 regression) ──────────────────────────────
    // A SECOND customer site with a NON-SECRET post + attachment.
    const siteB = await payload.create({
      collection: 'sites',
      data: {
        siteId: uniqueSiteId('mpb'),
        name: 'Member Post Site B',
        url: 'https://mpb.example.com',
      },
      overrideAccess: true,
    })
    siteBId = siteB.id
    const boardB = await payload.create({
      collection: 'boards',
      data: {
        tenant: siteBId,
        name: marker('BoardB'),
        boardType: qnaType.id,
        attachmentsEnabled: true,
        attachmentMaxCount: 3,
      },
      overrideAccess: true,
    })
    const attB = await createAttachment(`${marker('bpub')}.png`, siteBId)
    const nonSecretPostB = await payload.create({
      collection: 'posts',
      data: {
        board: boardB.id,
        title: marker('BPublicFile'),
        attachments: [{ media: attB, description: 'b public' }],
      },
      overrideAccess: true,
    })
    nonSecretPostBId = nonSecretPostB.id

    // A NON-SECRET post + attachment on the admin `bos` site (seeded by sitesStep).
    const bos = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'bos' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const bosId = bos.docs[0]!.id
    const boardBos = await payload.create({
      collection: 'boards',
      data: {
        tenant: bosId,
        name: marker('BoardBos'),
        boardType: qnaType.id,
        attachmentsEnabled: true,
        attachmentMaxCount: 3,
      },
      overrideAccess: true,
    })
    const attBos = await createAttachment(`${marker('bospub')}.png`, bosId)
    const bosPost = await payload.create({
      collection: 'posts',
      data: {
        board: boardBos.id,
        title: marker('BosPublicFile'),
        attachments: [{ media: attBos, description: 'bos public' }],
      },
      overrideAccess: true,
    })
    bosPostId = bosPost.id
  })

  describe('D4 — answer attribution auto-stamp (forgery blocked)', () => {
    it('auto-stamps answeredBy to the acting admin and overrides a forged answeredBy', async () => {
      const before = Date.now()
      const updated = await payload.update({
        collection: 'posts',
        id: qnaPostId,
        data: {
          answer: lexical('Here is the official answer.'),
          // Forged — must be overridden to the acting admin (adminA):
          answeredBy: otherAdmin.id,
          answeredAt: new Date('2000-01-01').toISOString(),
        } as never,
        user: adminA as never,
        overrideAccess: false,
      })

      expect(updated.isAnswered).toBe(true)
      expect(toRelationId(updated.answeredBy)).toBe(adminA.id)
      expect(toRelationId(updated.answeredBy)).not.toBe(otherAdmin.id)
      // answeredAt is the server clock, not the forged year-2000 value.
      expect(new Date(updated.answeredAt as string).getTime()).toBeGreaterThanOrEqual(before)
    })

    it('clears attribution when the answer is removed', async () => {
      const cleared = await payload.update({
        collection: 'posts',
        id: qnaPostId,
        data: { answer: null } as never,
        user: adminA as never,
        overrideAccess: false,
      })
      expect(cleared.isAnswered).toBe(false)
      expect(cleared.answeredBy ?? null).toBeNull()
      expect(cleared.answeredAt ?? null).toBeNull()
    })
  })

  describe('seam #4 — member download branch', () => {
    it('a logged-in MEMBER can download a NON-SECRET post attachment ON THEIR OWN SITE', async () => {
      expect(
        await canDownloadPost({
          payload,
          user: member,
          post: { id: nonSecretPostId, isSecret: false, tenant: siteId },
        }),
      ).toBe(true)
      const res = await handleFileDownload({
        payload,
        user: member,
        postId: String(nonSecretPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-disposition')).toContain('attachment')
    })

    it('C1: a member of site A is DENIED a NON-SECRET attachment on ANOTHER customer site', async () => {
      // Fails WITHOUT the tenant check (the member branch would allow ANY
      // non-secret post's attachment across every tenant).
      expect(
        await canDownloadPost({
          payload,
          user: member,
          post: { id: nonSecretPostBId, isSecret: false, tenant: siteBId },
        }),
      ).toBe(false)
      const res = await handleFileDownload({
        payload,
        user: member,
        postId: String(nonSecretPostBId),
        fileSn: 1,
      })
      expect(res.status).toBe(403)
    })

    it('C1: a member of site A is DENIED a NON-SECRET attachment on the admin bos site', async () => {
      const res = await handleFileDownload({
        payload,
        user: member,
        postId: String(bosPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(403)
    })

    it('a member CANNOT download a SECRET post attachment', async () => {
      expect(
        await canDownloadPost({
          payload,
          user: member,
          post: { id: secretPostId, isSecret: true },
        }),
      ).toBe(false)
      const res = await handleFileDownload({
        payload,
        user: member,
        postId: String(secretPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(403)
    })

    it('ANONYMOUS download is still denied even for a non-secret post (T4-zero invariant)', async () => {
      const res = await handleFileDownload({
        payload,
        user: null,
        postId: String(nonSecretPostId),
        fileSn: 1,
      })
      expect(res.status).toBe(403)
    })

    it('/api/files/download is IP-guard-exempt; /api/attachments/file stays guarded', () => {
      expect(classifyAdminPath('/api/files/download')).toBe('exempt')
      expect(classifyAdminPath('/api/attachments/file/x.png')).toBe('guard')
    })
  })
})
