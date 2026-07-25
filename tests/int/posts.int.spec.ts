import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { canDownloadPost, handleFileDownload } from '@/endpoints/fileDownload'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { boardTypesStep } from '@/seed/steps/boardTypes'
import { boardsStep, SEED_BOARDS } from '@/seed/steps/boards'
import { memberBannedWordsStep, SEED_MEMBER_BANNED_WORDS } from '@/seed/steps/memberBannedWords'
import { postsStep } from '@/seed/steps/posts'
import { profanityWordsStep, SEED_PROFANITY_WORDS } from '@/seed/steps/profanityWords'
import { sitesStep } from '@/seed/steps/sites'

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

async function boardTypeIdByCode(code: string): Promise<number> {
  const found = await payload.find({
    collection: 'boardTypes',
    where: { code: { equals: code } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (id === undefined) throw new Error(`boardType ${code} not seeded`)
  return id
}

// Task 4-zero: post attachments live in the tenant-scoped `attachments`
// collection, not the public `media` pool. The multi-tenant plugin requires a
// `tenant`; created with overrideAccess (a system write — the tenant-membership
// guard is exempt). The download endpoint fetches them with overrideAccess.
async function createAttachment(
  name: string,
  mimetype: string,
  data: Buffer,
  tenantId: number,
): Promise<number> {
  const doc = await payload.create({
    collection: 'attachments',
    data: { alt: name, tenant: tenantId } as never,
    file: { data, name, mimetype, size: data.length },
    overrideAccess: true,
  })
  return doc.id
}

describe('posts + word filters + secure download (Task 3B)', () => {
  let demoSiteId: number
  let photoTypeId: number
  let qnaTypeId: number

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])

    const demo = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    demoSiteId = demo.docs[0]!.id
    photoTypeId = await boardTypeIdByCode('PG0002')
    qnaTypeId = await boardTypeIdByCode('PG0003')
  })

  async function makeBoard(data: Record<string, unknown>): Promise<number> {
    const board = await payload.create({
      collection: 'boards',
      data: { tenant: demoSiteId, name: marker('Board'), boardType: photoTypeId, ...data },
      overrideAccess: true,
    })
    return board.id
  }

  // ── config-driven required fields ──────────────────────────────────────
  describe('board-config-driven validation', () => {
    it('rejects a post missing a field required by the board grid', async () => {
      const boardId = await makeBoard({
        fields: [
          { fieldKey: 'title', useFlag: true, requiredFlag: true, inputType: 'text' },
          { fieldKey: 'author', useFlag: true, requiredFlag: true, inputType: 'text' },
        ],
      })
      await expect(
        payload.create({
          collection: 'posts',
          data: { board: boardId, title: marker('NoAuthor') },
          overrideAccess: true,
        }),
      ).rejects.toThrow()

      const ok = await payload.create({
        collection: 'posts',
        data: { board: boardId, title: marker('WithAuthor'), author: 'Someone' },
        overrideAccess: true,
      })
      expect(ok.id).toBeDefined()
    })

    it('enforces category requiredFlag + value-belongs-to-group', async () => {
      const suffix = lettersOnly()
      const classification = await payload.create({
        collection: 'codeClassifications',
        data: { code: `postcat${suffix}`, name: 'Posts cat classification' },
        overrideAccess: true,
      })
      const group = await payload.create({
        collection: 'codeGroups',
        data: {
          codeId: `POSTCAT_${suffix.toUpperCase()}`,
          name: 'Posts cat group',
          classification: classification.id,
        },
        overrideAccess: true,
      })
      const otherGroup = await payload.create({
        collection: 'codeGroups',
        data: {
          codeId: `OTHERCAT_${suffix.toUpperCase()}`,
          name: 'Other cat group',
          classification: classification.id,
        },
        overrideAccess: true,
      })
      const code = await payload.create({
        collection: 'codes',
        data: { group: group.id, code: '01', name: 'In group' },
        overrideAccess: true,
      })
      const otherCode = await payload.create({
        collection: 'codes',
        data: { group: otherGroup.id, code: '01', name: 'Wrong group' },
        overrideAccess: true,
      })

      const boardId = await makeBoard({
        categories: [{ classificationCode: group.id, useFlag: true, requiredFlag: true }],
      })

      // missing category → rejected
      await expect(
        payload.create({
          collection: 'posts',
          data: { board: boardId, title: marker('NoCat') },
          overrideAccess: true,
        }),
      ).rejects.toThrow()

      // category value from the WRONG group → rejected
      await expect(
        payload.create({
          collection: 'posts',
          data: { board: boardId, title: marker('WrongGroup'), category1: otherCode.id },
          overrideAccess: true,
        }),
      ).rejects.toThrow()

      // valid category value → accepted
      const ok = await payload.create({
        collection: 'posts',
        data: { board: boardId, title: marker('GoodCat'), category1: code.id },
        overrideAccess: true,
      })
      expect(toRelationId(ok.category1)).toBe(code.id)
    })
  })

  // ── attachments ────────────────────────────────────────────────────────
  describe('attachment constraints', () => {
    it('rejects more attachments than the board allows', async () => {
      const boardId = await makeBoard({ attachmentsEnabled: true, attachmentMaxCount: 1 })
      const m1 = await createAttachment(`${marker('a')}.png`, 'image/png', PNG_1x1, demoSiteId)
      const m2 = await createAttachment(`${marker('b')}.png`, 'image/png', PNG_1x1, demoSiteId)
      await expect(
        payload.create({
          collection: 'posts',
          data: {
            board: boardId,
            title: marker('TooMany'),
            attachments: [{ media: m1 }, { media: m2 }],
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects an attachment whose extension is not allowed', async () => {
      const boardId = await makeBoard({
        attachmentsEnabled: true,
        attachmentMaxCount: 3,
        attachmentAllowedExtensions: 'png',
      })
      const txt = await createAttachment(
        `${marker('doc')}.txt`,
        'text/plain',
        Buffer.from('hi'),
        demoSiteId,
      )
      await expect(
        payload.create({
          collection: 'posts',
          data: { board: boardId, title: marker('BadExt'), attachments: [{ media: txt }] },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('assigns fileSn + downloadCount and accepts a valid attachment', async () => {
      const boardId = await makeBoard({
        attachmentsEnabled: true,
        attachmentMaxCount: 3,
        attachmentAllowedExtensions: 'png',
      })
      const png = await createAttachment(`${marker('img')}.png`, 'image/png', PNG_1x1, demoSiteId)
      const post = await payload.create({
        collection: 'posts',
        data: { board: boardId, title: marker('GoodAtt'), attachments: [{ media: png }] },
        overrideAccess: true,
      })
      expect(post.attachments?.[0]?.fileSn).toBe(1)
      expect(post.attachments?.[0]?.downloadCount).toBe(0)
    })

    it('rejects more than one representative attachment', async () => {
      const boardId = await makeBoard({ attachmentsEnabled: true, attachmentMaxCount: 3 })
      const m1 = await createAttachment(`${marker('r1')}.png`, 'image/png', PNG_1x1, demoSiteId)
      const m2 = await createAttachment(`${marker('r2')}.png`, 'image/png', PNG_1x1, demoSiteId)
      await expect(
        payload.create({
          collection: 'posts',
          data: {
            board: boardId,
            title: marker('TwoReps'),
            attachments: [
              { media: m1, isRepresentative: true },
              { media: m2, isRepresentative: true },
            ],
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('auto-selects the first attachment as representative on a photo board', async () => {
      const boardId = await makeBoard({
        boardType: photoTypeId,
        attachmentsEnabled: true,
        attachmentMaxCount: 3,
      })
      const png = await createAttachment(`${marker('g')}.png`, 'image/png', PNG_1x1, demoSiteId)
      const post = await payload.create({
        collection: 'posts',
        data: { board: boardId, title: marker('AutoRep'), attachments: [{ media: png }] },
        overrideAccess: true,
      })
      expect(post.attachments?.[0]?.isRepresentative).toBe(true)
    })
  })

  // ── profanity ──────────────────────────────────────────────────────────
  describe('profanity gate', () => {
    it('rejects a post whose content contains an active profanity word (no slur echoed)', async () => {
      const word = `zzprof${lettersOnly()}`
      await payload.create({
        collection: 'profanityWords',
        data: { word, isActive: true },
        overrideAccess: true,
      })
      const boardId = await makeBoard({})
      let threw: unknown
      try {
        await payload.create({
          collection: 'posts',
          data: {
            board: boardId,
            title: marker('Clean'),
            content: lexical(`text with ${word} in it`),
          },
          overrideAccess: true,
        })
      } catch (e) {
        threw = e
      }
      expect(threw).toBeDefined()
      // The error must NOT echo the offending word.
      expect(String((threw as { message?: string })?.message ?? threw)).not.toContain(word)
    })

    it('ignores an inactive profanity word', async () => {
      const word = `zzinact${lettersOnly()}`
      await payload.create({
        collection: 'profanityWords',
        data: { word, isActive: false },
        overrideAccess: true,
      })
      const boardId = await makeBoard({})
      const ok = await payload.create({
        collection: 'posts',
        data: { board: boardId, title: `title ${word}` },
        overrideAccess: true,
      })
      expect(ok.id).toBeDefined()
    })
  })

  // ── qna ────────────────────────────────────────────────────────────────
  describe('Q&A answer flow', () => {
    it('derives isAnswered from answer presence', async () => {
      const boardId = await makeBoard({ boardType: qnaTypeId })
      const unanswered = await payload.create({
        collection: 'posts',
        data: { board: boardId, title: marker('Q1'), content: lexical('a question') },
        overrideAccess: true,
      })
      expect(unanswered.isAnswered).toBe(false)
      expect(unanswered.boardKind).toBe('qna')

      const answered = await payload.update({
        collection: 'posts',
        id: unanswered.id,
        data: { answer: lexical('the answer') },
        overrideAccess: true,
      })
      expect(answered.isAnswered).toBe(true)
    })
  })

  // ── defaults ───────────────────────────────────────────────────────────
  describe('post defaults', () => {
    it('defaults viewCount to 0 and inherits the board tenant', async () => {
      const boardId = await makeBoard({})
      const post = await payload.create({
        collection: 'posts',
        data: { board: boardId, title: marker('Defaults') },
        overrideAccess: true,
      })
      expect(post.viewCount).toBe(0)
      expect(toRelationId(post.tenant)).toBe(demoSiteId)
    })
  })

  // ── tenant scoping ─────────────────────────────────────────────────────
  describe('tenant scoping (per-user)', () => {
    let siteAId: number
    let siteBId: number
    let boardAId: number
    let scopedUserA: Awaited<ReturnType<typeof payload.create>>
    let scopedUserB: Awaited<ReturnType<typeof payload.create>>
    let superUser: Awaited<ReturnType<typeof payload.create>>

    beforeAll(async () => {
      const siteA = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('pa'), name: 'Posts A', url: 'https://pa.example.com' },
        overrideAccess: true,
      })
      const siteB = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('pb'), name: 'Posts B', url: 'https://pb.example.com' },
        overrideAccess: true,
      })
      siteAId = siteA.id
      siteBId = siteB.id
      const boardA = await payload.create({
        collection: 'boards',
        data: {
          tenant: siteAId,
          name: marker('BoardA'),
          boardType: photoTypeId,
          attachmentsEnabled: true,
          attachmentMaxCount: 3,
        },
        overrideAccess: true,
      })
      boardAId = boardA.id

      const postsMenu = await payload.find({
        collection: 'adminMenus',
        where: { menuKey: { equals: 'content.posts' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const postsMenuId = postsMenu.docs[0]!.id
      const scopedRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_POSTS_${lettersOnly().toUpperCase()}`,
          name: 'Posts-only test role',
          description: 'Grants content.posts only (non-super).',
          menuGrants: [postsMenuId],
        },
        overrideAccess: true,
      })
      scopedUserA = await payload.create({
        collection: 'users',
        data: {
          email: `psa-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          roles: [scopedRole.id],
          tenants: [{ tenant: siteAId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      scopedUserB = await payload.create({
        collection: 'users',
        data: {
          email: `psb-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          roles: [scopedRole.id],
          tenants: [{ tenant: siteBId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      const superRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_SUPER_${lettersOnly().toUpperCase()}`,
          name: 'Super test role (posts)',
          description: 'isSuper test role.',
          isSuper: true,
        },
        overrideAccess: true,
      })
      superUser = await payload.create({
        collection: 'users',
        data: {
          email: `psu-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          roles: [superRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })
    })

    it('a post inherits its board site; a non-super user cannot create on another site', async () => {
      // scopedUserB (site B) creating a post on site A's board → denied.
      await expect(
        payload.create({
          collection: 'posts',
          data: { board: boardAId, title: marker('CrossTenant') },
          user: scopedUserB,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      // scopedUserA (site A) can create on site A's board, and it inherits site A.
      const ok = await payload.create({
        collection: 'posts',
        data: { board: boardAId, title: marker('SameTenant') },
        user: scopedUserA,
        overrideAccess: false,
      })
      expect(toRelationId(ok.tenant)).toBe(siteAId)
    })

    // ── secure download endpoint ──────────────────────────────────────────
    describe('secure download endpoint', () => {
      let postId: number

      beforeAll(async () => {
        const png = await createAttachment(`${marker('dl')}.png`, 'image/png', PNG_1x1, siteAId)
        const post = await payload.create({
          collection: 'posts',
          data: {
            board: boardAId,
            title: marker('Downloadable'),
            attachments: [{ media: png, description: 'file' }],
          },
          overrideAccess: true,
        })
        postId = post.id
      })

      it('serves the file, sets Content-Disposition, and increments the counter', async () => {
        const res = await handleFileDownload({
          payload,
          user: superUser,
          postId: String(postId),
          fileSn: 1,
        })
        expect(res.status).toBe(200)
        expect(res.headers.get('content-disposition')).toContain('attachment')

        const reloaded = await payload.findByID({
          collection: 'posts',
          id: postId,
          overrideAccess: true,
        })
        expect(reloaded.attachments?.[0]?.downloadCount).toBe(1)
      })

      it('allows a same-tenant content.posts holder', async () => {
        expect(
          await canDownloadPost({
            payload,
            user: scopedUserA,
            post: { id: postId, tenant: siteAId },
          }),
        ).toBe(true)
        const res = await handleFileDownload({
          payload,
          user: scopedUserA,
          postId: String(postId),
          fileSn: 1,
        })
        expect(res.status).toBe(200)
      })

      it('forbids a user scoped to a different tenant (cannot see the post)', async () => {
        const res = await handleFileDownload({
          payload,
          user: scopedUserB,
          postId: String(postId),
          fileSn: 1,
        })
        expect(res.status).toBe(403)
      })

      it('forbids an anonymous request', async () => {
        const res = await handleFileDownload({
          payload,
          user: null,
          postId: String(postId),
          fileSn: 1,
        })
        expect(res.status).toBe(403)
      })

      it('404s for a missing post and a missing fileSn', async () => {
        const missingPost = await handleFileDownload({
          payload,
          user: superUser,
          postId: '99999999',
          fileSn: 1,
        })
        expect(missingPost.status).toBe(404)

        const missingSn = await handleFileDownload({
          payload,
          user: superUser,
          postId: String(postId),
          fileSn: 999,
        })
        expect(missingSn.status).toBe(404)
      })
    })
  })

  // ── seeds ──────────────────────────────────────────────────────────────
  describe('seeds', () => {
    it('seeds profanity words, member banned words, and posts idempotently', async () => {
      await runSeed(payload, [boardsStep, profanityWordsStep, memberBannedWordsStep, postsStep])
      await runSeed(payload, [boardsStep, profanityWordsStep, memberBannedWordsStep, postsStep])

      for (const word of SEED_PROFANITY_WORDS) {
        const found = await payload.find({
          collection: 'profanityWords',
          where: { word: { equals: word } },
          limit: 2,
          pagination: false,
          overrideAccess: true,
        })
        expect(found.docs).toHaveLength(1)
      }
      for (const entry of SEED_MEMBER_BANNED_WORDS) {
        const found = await payload.find({
          collection: 'memberBannedWords',
          where: { and: [{ word: { equals: entry.word } }, { scope: { equals: entry.scope } }] },
          limit: 2,
          pagination: false,
          overrideAccess: true,
        })
        expect(found.docs).toHaveLength(1)
      }

      // The seeded Q&A post has an answer → isAnswered true.
      const qnaBoard = await payload.find({
        collection: 'boards',
        where: { and: [{ tenant: { equals: demoSiteId } }, { name: { equals: 'Q&A' } }] },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const qnaPost = await payload.find({
        collection: 'posts',
        where: { board: { equals: qnaBoard.docs[0]!.id } },
        limit: 5,
        pagination: false,
        overrideAccess: true,
      })
      expect(qnaPost.docs.some((p) => p.isAnswered === true)).toBe(true)

      // The seeded attachment board exists (its bbsId pins to the legacy
      // B0000009 on a fresh install; in this shared DB the sequence may already
      // hold that value, so the pin gracefully falls back to an auto id — we
      // assert the board itself, not the exact id).
      const attachBoard = await payload.find({
        collection: 'boards',
        where: {
          and: [{ tenant: { equals: demoSiteId } }, { name: { equals: 'Attachment Board' } }],
        },
        limit: 2,
        pagination: false,
        overrideAccess: true,
      })
      expect(attachBoard.docs).toHaveLength(1)
      expect(attachBoard.docs[0]?.bbsId).toMatch(/^B\d{7}$/)

      // Idempotency: SEED_BOARDS all present exactly once.
      for (const board of SEED_BOARDS) {
        const found = await payload.find({
          collection: 'boards',
          where: { and: [{ tenant: { equals: demoSiteId } }, { name: { equals: board.name } }] },
          limit: 2,
          pagination: false,
          overrideAccess: true,
        })
        expect(found.docs).toHaveLength(1)
      }
    })
  })
})
