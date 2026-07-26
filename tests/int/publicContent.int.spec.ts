import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { resolveVisibleBoard, resolveVisibleContentPage, resolveVisiblePost } from '@/site/access'
import {
  dataManagerEnabled,
  loadAllBoardPosts,
  loadBoardListPage,
  resolveDataManager,
} from '@/site/board'
import { getSiteMenus } from '@/site/data'
import type { CurrentMember } from '@/site/member'
import { MemberAskError, submitMemberQuestion } from '@/members/ask'
import { runSeed } from '@/seed'
import { boardTypesStep } from '@/seed/steps/boardTypes'
import { sitesStep } from '@/seed/steps/sites'
import { adminMenusStep } from '@/seed/steps/adminMenus'

/**
 * Task 4C integration coverage: MEDIUM-1 direct-URL menu gating (content +
 * board + post), published-only web-content render, person-in-charge toggle,
 * board list pagination + pinned notices + search, D6 no-500 with a relationship
 * searchable field, secret-post 404, and member Q&A ask (forced fields + forge
 * denial + profanity + cross-site).
 */

let payload: Payload

function uniqueSiteId(label: string): string {
  return `t${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}
function marker(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
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

async function boardTypeIdFor(kind: string): Promise<number> {
  const found = await payload.find({
    collection: 'boardTypes',
    where: { kind: { equals: kind } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id
}

describe('Task 4C public content + board frontends', () => {
  let siteId: number
  let otherSiteId: number
  let integratedTypeId: number
  let qnaTypeId: number
  let member: CurrentMember

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])

    const site = await payload.create({
      collection: 'sites',
      data: {
        siteId: uniqueSiteId('4c'),
        name: 'Task4C Site',
        url: 'https://c4.example.com',
        dataManagerEnabled: true,
      },
      overrideAccess: true,
    })
    siteId = site.id
    const other = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('4co'), name: 'Other', url: 'https://o.example.com' },
      overrideAccess: true,
    })
    otherSiteId = other.id

    integratedTypeId = await boardTypeIdFor('integrated')
    qnaTypeId = await boardTypeIdFor('qna')

    const m = await payload.create({
      collection: 'members',
      data: {
        loginId: `c4member${Date.now()}`.toLowerCase(),
        email: `c4m-${Date.now()}@example.com`,
        name: 'C4 Member',
        password: 'Member-Pass-99',
        status: 'active',
        tenant: siteId,
      } as never,
      overrideAccess: true,
    })
    member = { id: m.id, name: 'C4 Member', tenant: siteId }
  })

  // ── MEDIUM-1: content menu direct-URL gating ────────────────────────────────
  describe('MEDIUM-1 — content page menu gating', () => {
    it('404s a content page behind an inactive or loggedInOnly menu (200 for the allowed visitor)', async () => {
      const activeMenu = await payload.create({
        collection: 'menus',
        data: { tenant: siteId, name: marker('Active'), contentType: 'content' },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'webContents',
        data: { menu: activeMenu.id, title: 'Active Page', content: lexical('hi') },
        overrideAccess: true,
      })

      const inactiveMenu = await payload.create({
        collection: 'menus',
        data: { tenant: siteId, name: marker('Inactive'), contentType: 'content', active: false },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'webContents',
        data: { menu: inactiveMenu.id, title: 'Hidden Page', content: lexical('secret') },
        overrideAccess: true,
      })

      const memberOnlyMenu = await payload.create({
        collection: 'menus',
        data: {
          tenant: siteId,
          name: marker('MemberOnly'),
          contentType: 'content',
          exposureCondition: 'loggedInOnly',
        },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'webContents',
        data: { menu: memberOnlyMenu.id, title: 'Member Page', content: lexical('members') },
        overrideAccess: true,
      })

      const menus = await getSiteMenus(payload, siteId)

      // Active → resolves for anyone.
      expect(
        await resolveVisibleContentPage(payload, siteId, activeMenu.menuNumber!, menus, null),
      ).not.toBeNull()
      // Inactive → 404 for everyone (MEDIUM-1: direct URL gated, not just nav).
      expect(
        await resolveVisibleContentPage(payload, siteId, inactiveMenu.menuNumber!, menus, null),
      ).toBeNull()
      expect(
        await resolveVisibleContentPage(payload, siteId, inactiveMenu.menuNumber!, menus, member),
      ).toBeNull()
      // loggedInOnly → 404 for anon, 200 for a member.
      expect(
        await resolveVisibleContentPage(payload, siteId, memberOnlyMenu.menuNumber!, menus, null),
      ).toBeNull()
      expect(
        await resolveVisibleContentPage(payload, siteId, memberOnlyMenu.menuNumber!, menus, member),
      ).not.toBeNull()
    })
  })

  // ── published-only render ───────────────────────────────────────────────────
  describe('web content renders the PUBLISHED version only (draft not shown)', () => {
    it('shows the published title even after a newer draft is saved', async () => {
      const menu = await payload.create({
        collection: 'menus',
        data: { tenant: siteId, name: marker('Versioned'), contentType: 'content' },
        overrideAccess: true,
      })
      const wc = await payload.create({
        collection: 'webContents',
        data: { menu: menu.id, title: 'PUBLISHED-V1', content: lexical('v1') },
        overrideAccess: true,
      })
      // Save a newer DRAFT on top — the published version must stay V1.
      await payload.update({
        collection: 'webContents',
        id: wc.id,
        data: { title: 'DRAFT-V2', content: lexical('v2') } as never,
        draft: true,
        overrideAccess: true,
      })

      const menus = await getSiteMenus(payload, siteId)
      const resolved = await resolveVisibleContentPage(
        payload,
        siteId,
        menu.menuNumber!,
        menus,
        null,
      )
      expect(resolved).not.toBeNull()
      expect(resolved!.content.title).toBe('PUBLISHED-V1')
    })
  })

  // ── person-in-charge toggle ─────────────────────────────────────────────────
  describe('person-in-charge toggle (ref 2-3)', () => {
    it('dataManagerEnabled reflects the site toggle and resolveDataManager resolves a department', async () => {
      const site = await payload.findByID({ collection: 'sites', id: siteId, overrideAccess: true })
      expect(dataManagerEnabled(site)).toBe(true)
      expect(dataManagerEnabled({ dataManagerEnabled: false })).toBe(false)
      expect(dataManagerEnabled(null)).toBe(false)

      const dept = await payload.create({
        collection: 'departments',
        data: { tenant: siteId, name: marker('Records Dept') } as never,
        overrideAccess: true,
      })
      const info = await resolveDataManager(payload, {
        relationTo: 'departments',
        value: dept.id,
      })
      expect(info?.name).toContain('Records Dept')
      // Unset → null.
      expect(await resolveDataManager(payload, null)).toBeNull()
    })
  })

  // ── board list: pagination + pinned notices + search ────────────────────────
  describe('board list pagination + pinned notices + search', () => {
    let boardId: number

    beforeAll(async () => {
      const board = await payload.create({
        collection: 'boards',
        data: {
          tenant: siteId,
          name: marker('ListBoard'),
          boardType: integratedTypeId,
          listCount: 5,
          pageCount: 10,
        },
        overrideAccess: true,
      })
      boardId = board.id

      // 12 regular posts.
      for (let i = 0; i < 12; i++) {
        await payload.create({
          collection: 'posts',
          data: { board: boardId, title: `Regular ${i}` },
          overrideAccess: true,
        })
      }
      // Two searchable posts.
      await payload.create({
        collection: 'posts',
        data: { board: boardId, title: 'AlphaUnique keyword post' },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'posts',
        data: { board: boardId, title: 'BetaOther post' },
        overrideAccess: true,
      })
      // Pinned notice (in window) + expired notice (out of window).
      await payload.create({
        collection: 'posts',
        data: { board: boardId, title: 'PINNED NOTICE', isNotice: true },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'posts',
        data: {
          board: boardId,
          title: 'EXPIRED NOTICE',
          isNotice: true,
          noticeTo: '2000-01-01T00:00:00.000Z',
        },
        overrideAccess: true,
      })
    })

    it('paginates regular posts and pins only in-window notices on page 1', async () => {
      const board = await payload.findByID({
        collection: 'boards',
        id: boardId,
        overrideAccess: true,
      })
      const page1 = await loadBoardListPage(payload, board, {}, 1)
      expect(page1.posts.length).toBe(5)
      expect(page1.pagination.page).toBe(1)
      expect(page1.pagination.totalPages).toBeGreaterThanOrEqual(3) // 14 regular / 5
      // Only the in-window notice is pinned (expired one excluded).
      expect(page1.notices.map((n) => n.title)).toContain('PINNED NOTICE')
      expect(page1.notices.map((n) => n.title)).not.toContain('EXPIRED NOTICE')

      const page2 = await loadBoardListPage(payload, board, {}, 2)
      expect(page2.posts.length).toBe(5)
      expect(page2.notices.length).toBe(0) // notices only on page 1
    })

    it('filters by keyword search', async () => {
      const board = await payload.findByID({
        collection: 'boards',
        id: boardId,
        overrideAccess: true,
      })
      const res = await loadBoardListPage(payload, board, { keyword: 'AlphaUnique' }, 1)
      const titles = res.posts.map((p) => p.title)
      expect(titles).toContain('AlphaUnique keyword post')
      expect(titles).not.toContain('BetaOther post')
    })
  })

  // ── D6: relationship-searchable field must not 500 ──────────────────────────
  describe('D6 — a relationship/column-less searchable field never 500s the list', () => {
    it('runs a keyword search on a board that marks department + division searchable', async () => {
      const board = await payload.create({
        collection: 'boards',
        data: {
          tenant: siteId,
          name: marker('TrickyBoard'),
          boardType: integratedTypeId,
          fields: [
            { fieldKey: 'title', useFlag: true, searchFlag: true, inputType: 'text' },
            { fieldKey: 'department', useFlag: true, searchFlag: true, inputType: 'text' },
            { fieldKey: 'division', useFlag: true, searchFlag: true, inputType: 'text' },
          ],
        },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'posts',
        data: { board: board.id, title: 'searchable via title' },
        overrideAccess: true,
      })
      // Would 500 pre-D6 (like on a relationship/absent column). Must resolve.
      const res = await loadBoardListPage(payload, board, { keyword: 'searchable' }, 1)
      expect(res.posts.map((p) => p.title)).toContain('searchable via title')
      // A field-scoped keyword on the relationship column is ignored (no 500).
      const scoped = await loadBoardListPage(
        payload,
        board,
        { keyword: 'x', field: 'department' },
        1,
      )
      expect(Array.isArray(scoped.posts)).toBe(true)
    })
  })

  // ── secret-post 404 + board menu gating for post detail ─────────────────────
  describe('secret post + post menu gating', () => {
    it('404s a secret post for a member, resolves a non-secret one', async () => {
      const board = await payload.create({
        collection: 'boards',
        data: {
          tenant: siteId,
          name: marker('SecretBoard'),
          boardType: integratedTypeId,
          secretPostAllowed: true,
        },
        overrideAccess: true,
      })
      const open = await payload.create({
        collection: 'posts',
        data: { board: board.id, title: 'Open Post' },
        overrideAccess: true,
      })
      const secret = await payload.create({
        collection: 'posts',
        data: { board: board.id, title: 'Secret Post', isSecret: true },
        overrideAccess: true,
      })
      const menus = await getSiteMenus(payload, siteId)

      expect(
        await resolveVisiblePost(payload, siteId, board.bbsId!, open.id, menus, member),
      ).not.toBeNull()
      expect(
        await resolveVisiblePost(payload, siteId, board.bbsId!, secret.id, menus, member),
      ).toBeNull()
    })

    it('404s a board (and its posts) behind an inactive owning menu', async () => {
      const board = await payload.create({
        collection: 'boards',
        data: { tenant: siteId, name: marker('GatedBoard'), boardType: integratedTypeId },
        overrideAccess: true,
      })
      const post = await payload.create({
        collection: 'posts',
        data: { board: board.id, title: 'Under Gated' },
        overrideAccess: true,
      })
      // An INACTIVE board menu opens this board.
      await payload.create({
        collection: 'menus',
        data: {
          tenant: siteId,
          name: marker('GatedMenu'),
          contentType: 'board',
          board: board.id,
          active: false,
        },
        overrideAccess: true,
      })
      const menus = await getSiteMenus(payload, siteId)

      expect(await resolveVisibleBoard(payload, siteId, board.bbsId!, menus, null)).toBeNull()
      expect(
        await resolveVisiblePost(payload, siteId, board.bbsId!, post.id, menus, null),
      ).toBeNull()
    })
  })

  // ── member Q&A ask: forced fields + forge denial ────────────────────────────
  describe('member Q&A ask (forced board/site/author, forge denial)', () => {
    let qnaBbsId: string
    let qnaBoardId: number

    beforeAll(async () => {
      const board = await payload.create({
        collection: 'boards',
        data: {
          tenant: siteId,
          name: marker('QnaBoard'),
          boardType: qnaTypeId,
          userPostAllowed: true,
        },
        overrideAccess: true,
      })
      qnaBoardId = board.id
      qnaBbsId = board.bbsId!
    })

    it('creates a question with server-forced board/tenant/author', async () => {
      const { id } = await submitMemberQuestion(
        payload,
        { title: 'My question', content: 'please help' },
        { member, bbsId: qnaBbsId },
      )
      const post = await payload.findByID({
        collection: 'posts',
        id,
        depth: 0,
        overrideAccess: true,
      })
      expect(String((post.board as { toString(): string }) ?? post.board)).toContain(
        String(qnaBoardId),
      )
      expect(String(post.tenant)).toContain(String(siteId))
      expect(post.author).toBe('C4 Member')
      expect(post.isSecret).toBeFalsy()
      expect(post.isNotice).toBeFalsy()
      expect(post.isAnswered).toBeFalsy()
    })

    it('ignores forged isSecret/isNotice/answer/answeredBy in the payload', async () => {
      const { id } = await submitMemberQuestion(
        payload,
        {
          title: 'Forged question',
          content: 'body',
          isSecret: true,
          isNotice: true,
          answer: lexical('forged answer'),
          answeredBy: member!.id,
          board: 999999,
          tenant: otherSiteId,
        } as never,
        { member, bbsId: qnaBbsId },
      )
      const post = await payload.findByID({
        collection: 'posts',
        id,
        depth: 0,
        overrideAccess: true,
      })
      expect(post.isSecret).toBeFalsy()
      expect(post.isNotice).toBeFalsy()
      expect(post.isAnswered).toBeFalsy()
      expect(post.answeredBy ?? null).toBeNull()
      // board/tenant forced from server state, not the forged values.
      expect(String(post.tenant)).toContain(String(siteId))
      expect(String(post.tenant)).not.toContain(String(otherSiteId))
    })

    it('rejects a non-member, a non-qna board, a disabled board, and a cross-site board', async () => {
      await expect(
        submitMemberQuestion(payload, { title: 'x' }, { member: null, bbsId: qnaBbsId }),
      ).rejects.toBeInstanceOf(MemberAskError)

      // A standard (non-qna) board on the member's site.
      const std = await payload.create({
        collection: 'boards',
        data: {
          tenant: siteId,
          name: marker('StdBoard'),
          boardType: integratedTypeId,
          userPostAllowed: true,
        },
        overrideAccess: true,
      })
      await expect(
        submitMemberQuestion(payload, { title: 'x' }, { member, bbsId: std.bbsId! }),
      ).rejects.toBeInstanceOf(MemberAskError)

      // A qna board with userPostAllowed OFF.
      const closed = await payload.create({
        collection: 'boards',
        data: {
          tenant: siteId,
          name: marker('ClosedQna'),
          boardType: qnaTypeId,
          userPostAllowed: false,
        },
        overrideAccess: true,
      })
      await expect(
        submitMemberQuestion(payload, { title: 'x' }, { member, bbsId: closed.bbsId! }),
      ).rejects.toBeInstanceOf(MemberAskError)

      // A qna board on ANOTHER site — not resolvable on the member's tenant.
      const crossBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: otherSiteId,
          name: marker('CrossQna'),
          boardType: qnaTypeId,
          userPostAllowed: true,
        },
        overrideAccess: true,
      })
      await expect(
        submitMemberQuestion(payload, { title: 'x' }, { member, bbsId: crossBoard.bbsId! }),
      ).rejects.toBeInstanceOf(MemberAskError)
    })

    it('rejects a question containing an active profanity word', async () => {
      const badWord = `bannedword${Date.now()}`
      await payload.create({
        collection: 'profanityWords',
        data: { word: badWord, isActive: true } as never,
        overrideAccess: true,
      })
      await expect(
        submitMemberQuestion(
          payload,
          { title: `hello ${badWord}`, content: 'x' },
          { member, bbsId: qnaBbsId },
        ),
      ).rejects.toBeInstanceOf(MemberAskError)
    })

    it('lists Q&A posts (for the board render)', async () => {
      const board = await payload.findByID({
        collection: 'boards',
        id: qnaBoardId,
        overrideAccess: true,
      })
      const posts = await loadAllBoardPosts(payload, board)
      expect(posts.length).toBeGreaterThan(0)
    })
  })
})
