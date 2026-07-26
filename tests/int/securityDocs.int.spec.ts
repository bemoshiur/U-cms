import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { SECURITY_DOCS_MENU_KEY } from '@/access/securityDocs'
import { PASSWORD_POLICY_MENU_KEY } from '@/privacy/passwordPolicyData'
import { PERSONAL_INFO_LOGS_MENU_KEY } from '@/endpoints/personalInfoLogsExport'
import { PRIVACY_ORG_MENU_KEY, PRIVACY_ROLE_OFFICER, PRIVACY_ROLE_STAFF } from '@/privacy/orgChart'
import { resolveBoardByBbsId, resolvePostForBoard } from '@/site/data'
import { loadAllBoardPosts, loadBoardDetail } from '@/site/board'
import { resolveVisibleBoard, resolveVisiblePost } from '@/site/access'
import { loadDownloadRows } from '@/site/downloadStatsData'
import { canDownloadPost, handleFileDownload } from '@/endpoints/fileDownload'
import type { Board } from '@/payload-types'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'
import { sitesStep } from '@/seed/steps/sites'
import { departmentsStep } from '@/seed/steps/departments'
import { boardTypesStep } from '@/seed/steps/boardTypes'
import { privacyRolesStep } from '@/seed/steps/privacyRoles'
import { securityDocsStep, SECURITY_DOC_BOARDS } from '@/seed/steps/securityDocs'
import { privacyMenuGrantsStep } from '@/seed/steps/privacyMenuGrants'

/**
 * Task 6D — the four §3 security-document boards + the Privacy menu wiring.
 * Boots real Payload against Postgres and exercises the seed, the privacy-role
 * grant extension, and the KEY security property: the security docs are gated
 * on `privacy.securityDocs`, so a general content admin can neither read nor
 * write them, while a privacy officer (and super) can — server-side, not just
 * nav-hidden. No cross-tenant leak.
 */
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

async function menuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.id as number
}
async function boardTypeIdByCode(code: string): Promise<number> {
  const found = await payload.find({
    collection: 'boardTypes',
    where: { code: { equals: code } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.id as number
}
async function grantIds(roleId: string): Promise<number[]> {
  const found = await payload.find({
    collection: 'roles',
    where: { roleId: { equals: roleId } },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return (found.docs[0]?.menuGrants ?? []).map((g) =>
    typeof g === 'object' ? g.id : g,
  ) as number[]
}

describe('Task 6D — security-document boards + §3 privacy menu wiring', () => {
  let demoSiteId: number
  let photoTypeId: number
  let attachmentTypeId: number

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [
      adminMenusStep,
      rolesStep,
      superAdminStep,
      sitesStep,
      departmentsStep,
      boardTypesStep,
      securityDocsStep,
      privacyRolesStep,
      privacyMenuGrantsStep,
    ])

    const demo = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    demoSiteId = demo.docs[0]!.id
    photoTypeId = await boardTypeIdByCode('PG0002')
    attachmentTypeId = await boardTypeIdByCode('PG0006')
  })

  // ── Part 1: the four boards exist, are flagged, and are non-empty ─────────
  describe('the four mounted security-document boards (ref 3-4)', () => {
    it('seeds exactly the four boards, each securityDoc + attachment-enabled, with example posts', async () => {
      // Idempotent: re-running finds everything and skips (no duplicates).
      await securityDocsStep.run(payload)

      for (const lib of SECURITY_DOC_BOARDS) {
        const found = await payload.find({
          collection: 'boards',
          where: { and: [{ tenant: { equals: demoSiteId } }, { name: { equals: lib.name } }] },
          limit: 2,
          pagination: false,
          overrideAccess: true,
        })
        expect(found.docs, `board ${lib.name} unique`).toHaveLength(1)
        const board = found.docs[0]!
        expect(board.securityDoc).toBe(true)
        expect(board.attachmentsEnabled).toBe(true)

        const posts = await payload.find({
          collection: 'posts',
          where: { board: { equals: board.id } },
          pagination: false,
          limit: 0,
          overrideAccess: true,
        })
        expect(posts.docs.length).toBeGreaterThanOrEqual(2)
        // The denorm flag rode down onto every post via the board hook.
        expect(posts.docs.every((p) => p.securityDoc === true)).toBe(true)
      }
    })
  })

  // ── Part 2: privacy-role grant extension (idempotent) ─────────────────────
  describe('privacy-role §3 menu grants', () => {
    it('OFFICER holds the FULL §3 surface; STAFF holds the read subset (not personal-info logs)', async () => {
      const [
        accessLogs,
        loginHistory,
        permissionLogs,
        personalInfoLogs,
        securityDocs,
        orgChart,
        passwordPolicies,
      ] = await Promise.all([
        menuId('privacy.accessLogs'),
        menuId('privacy.loginHistory'),
        menuId('privacy.permissionLogs'),
        menuId(PERSONAL_INFO_LOGS_MENU_KEY),
        menuId(SECURITY_DOCS_MENU_KEY),
        menuId(PRIVACY_ORG_MENU_KEY),
        menuId(PASSWORD_POLICY_MENU_KEY),
      ])

      const officer = await grantIds(PRIVACY_ROLE_OFFICER)
      for (const id of [
        accessLogs,
        loginHistory,
        permissionLogs,
        personalInfoLogs,
        securityDocs,
        orgChart,
        passwordPolicies,
      ]) {
        expect(officer).toContain(id)
      }

      const staff = await grantIds(PRIVACY_ROLE_STAFF)
      expect(staff).toContain(securityDocs)
      expect(staff).toContain(orgChart)
      expect(staff).toContain(accessLogs)
      // Staff must NOT reach the most-sensitive personal-info access history
      // nor password-policy management.
      expect(staff).not.toContain(personalInfoLogs)
      expect(staff).not.toContain(passwordPolicies)
    })

    it('is additive + idempotent — re-running adds nothing and never duplicates', async () => {
      const before = await grantIds(PRIVACY_ROLE_OFFICER)
      await privacyMenuGrantsStep.run(payload)
      const after = await grantIds(PRIVACY_ROLE_OFFICER)
      expect(after.sort()).toEqual(before.sort())
      // No duplicate ids.
      expect(new Set(after).size).toBe(after.length)
    })
  })

  // ── Part 3: the security gate (server-side, not nav-cosmetic) ─────────────
  describe('security-document access gate', () => {
    let ordinaryBoardId: number
    let ordinaryPostId: number
    let secBoardId: number
    let secPostId: number
    let otherSiteSecBoardId: number
    let contentAdmin: Awaited<ReturnType<typeof payload.create>>
    let privacyOfficer: Awaited<ReturnType<typeof payload.create>>
    let superUser: Awaited<ReturnType<typeof payload.create>>

    beforeAll(async () => {
      // Fixtures on the demo tenant: one ordinary board+post, one security-doc
      // board+post.
      const ordinaryBoard = await payload.create({
        collection: 'boards',
        data: { tenant: demoSiteId, name: marker('OrdinaryBoard'), boardType: photoTypeId },
        overrideAccess: true,
      })
      ordinaryBoardId = ordinaryBoard.id
      const ordinaryPost = await payload.create({
        collection: 'posts',
        data: { board: ordinaryBoardId, title: marker('OrdinaryPost'), author: 'A' },
        overrideAccess: true,
      })
      ordinaryPostId = ordinaryPost.id
      expect(ordinaryPost.securityDoc).toBeFalsy()

      const secBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('SecBoard'),
          boardType: attachmentTypeId,
          securityDoc: true,
        },
        overrideAccess: true,
      })
      secBoardId = secBoard.id
      expect(secBoard.securityDoc).toBe(true)
      const secPost = await payload.create({
        collection: 'posts',
        data: { board: secBoardId, title: marker('SecPost'), author: 'A' },
        overrideAccess: true,
      })
      secPostId = secPost.id
      expect(secPost.securityDoc).toBe(true)

      // A SECOND site with its own security-doc board (cross-tenant fixture).
      const otherSite = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('o'), name: 'Other Tenant', url: 'https://o.example.com' },
        overrideAccess: true,
      })
      const otherSecBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: otherSite.id,
          name: marker('OtherSecBoard'),
          boardType: attachmentTypeId,
          securityDoc: true,
        },
        overrideAccess: true,
      })
      otherSiteSecBoardId = otherSecBoard.id

      // A content admin: content.boards + content.posts, assigned to demo, NO
      // privacy grant.
      const contentRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_CONTENT_${lettersOnly().toUpperCase()}`,
          name: 'Content-only test role',
          description: 'Grants content.boards + content.posts (non-super, no privacy).',
          menuGrants: [await menuId('content.boards'), await menuId('content.posts')],
        },
        overrideAccess: true,
      })
      contentAdmin = await payload.create({
        collection: 'users',
        data: {
          email: `content-${marker('u')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [contentRole.id],
          tenants: [{ tenant: demoSiteId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })

      // A privacy officer: privacy.securityDocs only, assigned to demo.
      const privacyRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_PRIVACY_${lettersOnly().toUpperCase()}`,
          name: 'Privacy security-docs test role',
          description: 'Grants privacy.securityDocs only (non-super, no content).',
          menuGrants: [await menuId(SECURITY_DOCS_MENU_KEY)],
        },
        overrideAccess: true,
      })
      privacyOfficer = await payload.create({
        collection: 'users',
        data: {
          email: `privacy-${marker('u')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [privacyRole.id],
          tenants: [{ tenant: demoSiteId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })

      const superRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_SUPER_${lettersOnly().toUpperCase()}`,
          name: 'Super test role (security-docs)',
          description: 'isSuper.',
          isSuper: true,
        },
        overrideAccess: true,
      })
      superUser = await payload.create({
        collection: 'users',
        data: {
          email: `super-${marker('u')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [superRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })
    })

    it('a content admin reads ordinary boards but NOT security-doc boards', async () => {
      const boards = await payload.find({
        collection: 'boards',
        user: contentAdmin,
        overrideAccess: false,
        pagination: false,
        limit: 0,
      })
      const ids = boards.docs.map((d) => d.id)
      expect(ids).toContain(ordinaryBoardId)
      expect(ids).not.toContain(secBoardId)

      await expect(
        payload.findByID({
          collection: 'boards',
          id: secBoardId,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('a content admin reads ordinary posts but NOT security-doc posts', async () => {
      const posts = await payload.find({
        collection: 'posts',
        user: contentAdmin,
        overrideAccess: false,
        pagination: false,
        limit: 0,
      })
      const ids = posts.docs.map((d) => d.id)
      expect(ids).toContain(ordinaryPostId)
      expect(ids).not.toContain(secPostId)

      await expect(
        payload.findByID({
          collection: 'posts',
          id: secPostId,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('a content admin CANNOT post to a security-doc board (write side closed)', async () => {
      await expect(
        payload.create({
          collection: 'posts',
          data: { board: secBoardId, title: marker('Sneaky'), author: 'X' },
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('a content admin CANNOT flip a board into the security-doc class (field-access strips it)', async () => {
      const created = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('TriesSecurity'),
          boardType: photoTypeId,
          securityDoc: true,
        } as never,
        user: contentAdmin,
        overrideAccess: false,
      })
      // The flag was stripped → it is an ORDINARY board they can still read.
      expect(created.securityDoc).toBeFalsy()
      await expect(
        payload.findByID({
          collection: 'boards',
          id: created.id,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()
    })

    it('a privacy officer reads security-doc boards + posts (but not ordinary ones)', async () => {
      const boards = await payload.find({
        collection: 'boards',
        user: privacyOfficer,
        overrideAccess: false,
        pagination: false,
        limit: 0,
      })
      const boardIds = boards.docs.map((d) => d.id)
      expect(boardIds).toContain(secBoardId)
      expect(boardIds).not.toContain(ordinaryBoardId)
      expect(boards.docs.every((b) => b.securityDoc === true)).toBe(true)

      await expect(
        payload.findByID({
          collection: 'boards',
          id: secBoardId,
          user: privacyOfficer,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()

      const posts = await payload.find({
        collection: 'posts',
        user: privacyOfficer,
        overrideAccess: false,
        pagination: false,
        limit: 0,
      })
      const postIds = posts.docs.map((d) => d.id)
      expect(postIds).toContain(secPostId)
      expect(postIds).not.toContain(ordinaryPostId)
    })

    it('a privacy officer on the demo tenant CANNOT read another tenant’s security docs (no cross-tenant leak)', async () => {
      await expect(
        payload.findByID({
          collection: 'boards',
          id: otherSiteSecBoardId,
          user: privacyOfficer,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('a super-admin reads BOTH ordinary and security-doc boards on every tenant', async () => {
      const boards = await payload.find({
        collection: 'boards',
        user: superUser,
        overrideAccess: false,
        pagination: false,
        limit: 0,
      })
      const ids = boards.docs.map((d) => d.id)
      expect(ids).toContain(ordinaryBoardId)
      expect(ids).toContain(secBoardId)
      expect(ids).toContain(otherSiteSecBoardId)
    })
  })

  // ── C1: the public site never exposes security docs (fail-without-fix) ────
  describe('public-site security-doc exclusion (C1)', () => {
    let secBbsId: string
    let secBoard: Board
    let secPostId: number
    let ordinaryBbsId: string
    let ordinaryPostId: number

    beforeAll(async () => {
      // A SEEDED security-doc board (on the public demo site) + one of its posts.
      const sec = await payload.find({
        collection: 'boards',
        where: {
          and: [{ tenant: { equals: demoSiteId } }, { name: { equals: 'Security Education' } }],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      secBoard = sec.docs[0]!
      secBbsId = secBoard.bbsId as string
      const secPosts = await payload.find({
        collection: 'posts',
        where: { board: { equals: secBoard.id } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      secPostId = secPosts.docs[0]!.id

      // A normal public board + post (positive control).
      const ord = await payload.create({
        collection: 'boards',
        data: { tenant: demoSiteId, name: marker('PublicOrdinary'), boardType: photoTypeId },
        overrideAccess: true,
      })
      ordinaryBbsId = ord.bbsId as string
      const ordPost = await payload.create({
        collection: 'posts',
        data: { board: ord.id, title: marker('PublicPost'), author: 'A' },
        overrideAccess: true,
      })
      ordinaryPostId = ordPost.id
    })

    it('every public board/post resolver returns null for a security-doc board (anon → 404)', async () => {
      // Board-level (the reliable exclusion).
      expect(await resolveBoardByBbsId(payload, demoSiteId, secBbsId)).toBeNull()
      expect(await loadBoardDetail(payload, demoSiteId, secBbsId)).toBeNull()
      // Even with NO menus (un-menued board = the leak scenario) it stays hidden.
      expect(await resolveVisibleBoard(payload, demoSiteId, secBbsId, [], null)).toBeNull()
      // Post-level (direct post URL).
      expect(await resolvePostForBoard(payload, demoSiteId, secBbsId, secPostId)).toBeNull()
      expect(
        await resolveVisiblePost(payload, demoSiteId, secBbsId, secPostId, [], null),
      ).toBeNull()
      // List/all-posts loaders exclude security-doc posts even if handed the board.
      expect(await loadAllBoardPosts(payload, secBoard)).toHaveLength(0)
    })

    it('a normal public board + post still resolve (no over-blocking)', async () => {
      const board = await resolveBoardByBbsId(payload, demoSiteId, ordinaryBbsId)
      expect(board).not.toBeNull()
      const resolved = await resolvePostForBoard(payload, demoSiteId, ordinaryBbsId, ordinaryPostId)
      expect(resolved).not.toBeNull()
    })
  })

  // ── M1: posts.securityDoc re-syncs when a board flips the flag ────────────
  describe('board securityDoc flip propagates to child posts (M1)', () => {
    it('flipping an ordinary board to security-doc updates its posts + locks out content admins', async () => {
      const board = await payload.create({
        collection: 'boards',
        data: { tenant: demoSiteId, name: marker('FlipBoard'), boardType: photoTypeId },
        overrideAccess: true,
      })
      const postA = await payload.create({
        collection: 'posts',
        data: { board: board.id, title: marker('FlipA'), author: 'A' },
        overrideAccess: true,
      })
      const postB = await payload.create({
        collection: 'posts',
        data: { board: board.id, title: marker('FlipB'), author: 'B' },
        overrideAccess: true,
      })
      expect(postA.securityDoc).toBeFalsy()
      expect(postB.securityDoc).toBeFalsy()

      // A content admin can read both while the board is ordinary.
      const contentRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_FLIP_${lettersOnly().toUpperCase()}`,
          name: 'Content flip test role',
          description: 'content.boards + content.posts',
          menuGrants: [await menuId('content.boards'), await menuId('content.posts')],
        },
        overrideAccess: true,
      })
      const contentAdmin = await payload.create({
        collection: 'users',
        data: {
          email: `flip-${marker('u')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [contentRole.id],
          tenants: [{ tenant: demoSiteId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      await expect(
        payload.findByID({
          collection: 'posts',
          id: postA.id,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()

      // Flip the board into the security-doc class.
      await payload.update({
        collection: 'boards',
        id: board.id,
        data: { securityDoc: true },
        overrideAccess: true,
      })

      // The denorm rode down onto BOTH posts...
      const reA = await payload.findByID({
        collection: 'posts',
        id: postA.id,
        overrideAccess: true,
      })
      const reB = await payload.findByID({
        collection: 'posts',
        id: postB.id,
        overrideAccess: true,
      })
      expect(reA.securityDoc).toBe(true)
      expect(reB.securityDoc).toBe(true)

      // ...so the content admin can no longer read them.
      await expect(
        payload.findByID({
          collection: 'posts',
          id: postA.id,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  // ── L1: download-stats never surface security-doc file metadata ───────────
  describe('download-stats exclusion (L1)', () => {
    /** A tiny 1×1 transparent PNG for the attachment fixtures. */
    const PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

    async function makeAttachment(): Promise<number> {
      const created = await payload.create({
        collection: 'attachments',
        data: { alt: 'stats fixture', tenant: demoSiteId } as never,
        file: {
          data: Buffer.from(PNG, 'base64'),
          name: `sd-stats-${Date.now()}-${Math.floor(Math.random() * 100000)}.png`,
          mimetype: 'image/png',
          size: Buffer.from(PNG, 'base64').length,
        },
        overrideAccess: true,
      })
      return created.id as number
    }

    it('a security-doc post with an attachment is absent from the download rows; an ordinary one is present', async () => {
      const ordBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('StatsOrdinary'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
        },
        overrideAccess: true,
      })
      const secBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('StatsSec'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
          securityDoc: true,
        },
        overrideAccess: true,
      })
      const ordPost = await payload.create({
        collection: 'posts',
        data: {
          board: ordBoard.id,
          title: marker('StatsOrdPost'),
          attachments: [{ media: await makeAttachment() }],
        } as never,
        overrideAccess: true,
      })
      const secPost = await payload.create({
        collection: 'posts',
        data: {
          board: secBoard.id,
          title: marker('StatsSecPost'),
          attachments: [{ media: await makeAttachment() }],
        } as never,
        overrideAccess: true,
      })
      expect(secPost.securityDoc).toBe(true)

      const rows = await loadDownloadRows(payload, { tenantId: demoSiteId })
      const postIds = rows.map((r) => String(r.postId))
      expect(postIds).toContain(String(ordPost.id))
      expect(postIds).not.toContain(String(secPost.id))
    })
  })

  // ── C1 (file endpoint): /api/files/download must not leak security-doc bytes ─
  describe('security-doc attachment download gate (C1 file endpoint)', () => {
    const PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

    async function makeAttachment(): Promise<number> {
      const created = await payload.create({
        collection: 'attachments',
        data: { alt: 'dl fixture', tenant: demoSiteId } as never,
        file: {
          data: Buffer.from(PNG, 'base64'),
          name: `sd-dl-${Date.now()}-${Math.floor(Math.random() * 100000)}.png`,
          mimetype: 'image/png',
          size: Buffer.from(PNG, 'base64').length,
        },
        overrideAccess: true,
      })
      return created.id as number
    }

    let secPost: Awaited<ReturnType<typeof payload.create>>
    let secFileSn: number
    let secMediaId: number
    let ordPost: Awaited<ReturnType<typeof payload.create>>
    let ordMediaId: number
    let member: Awaited<ReturnType<typeof payload.create>>
    let contentAdmin: Awaited<ReturnType<typeof payload.create>>
    let privacyOfficer: Awaited<ReturnType<typeof payload.create>>
    let superUser: Awaited<ReturnType<typeof payload.create>>

    beforeAll(async () => {
      const secBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('DlSecBoard'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
          securityDoc: true,
        },
        overrideAccess: true,
      })
      secMediaId = await makeAttachment()
      secPost = await payload.create({
        collection: 'posts',
        data: {
          board: secBoard.id,
          title: marker('DlSecPost'),
          attachments: [{ media: secMediaId }],
        } as never,
        overrideAccess: true,
      })
      secFileSn = (secPost as unknown as { attachments: { fileSn: number }[] }).attachments[0]!
        .fileSn

      const ordBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('DlOrdBoard'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
        },
        overrideAccess: true,
      })
      ordMediaId = await makeAttachment()
      ordPost = await payload.create({
        collection: 'posts',
        data: {
          board: ordBoard.id,
          title: marker('DlOrdPost'),
          attachments: [{ media: ordMediaId }],
        } as never,
        overrideAccess: true,
      })

      member = await payload.create({
        collection: 'members',
        data: {
          loginId: `sd-dl-member-${Date.now()}`.toLowerCase(),
          email: `sd-dl-m-${marker('e')}@example.com`.toLowerCase(),
          name: 'Download Member',
          password: 'Member-Pass-99',
          status: 'active',
          tenant: demoSiteId,
        } as never,
        overrideAccess: true,
      })

      const contentRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_DLCONTENT_${lettersOnly().toUpperCase()}`,
          name: 'Download content role',
          description: 'content.posts + content.boards',
          menuGrants: [await menuId('content.posts'), await menuId('content.boards')],
        },
        overrideAccess: true,
      })
      contentAdmin = await payload.create({
        collection: 'users',
        data: {
          email: `sd-dl-content-${marker('e')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [contentRole.id],
          tenants: [{ tenant: demoSiteId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })

      const privacyRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_DLPRIVACY_${lettersOnly().toUpperCase()}`,
          name: 'Download privacy role',
          description: 'privacy.securityDocs',
          menuGrants: [await menuId(SECURITY_DOCS_MENU_KEY)],
        },
        overrideAccess: true,
      })
      privacyOfficer = await payload.create({
        collection: 'users',
        data: {
          email: `sd-dl-privacy-${marker('e')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [privacyRole.id],
          tenants: [{ tenant: demoSiteId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })

      const superRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_DLSUPER_${lettersOnly().toUpperCase()}`,
          name: 'Download super role',
          description: 'isSuper',
          isSuper: true,
        },
        overrideAccess: true,
      })
      superUser = await payload.create({
        collection: 'users',
        data: {
          email: `sd-dl-super-${marker('e')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [superRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })
    })

    it('DENIES a security-doc attachment to a same-tenant member and a content-only admin', async () => {
      expect(await canDownloadPost({ payload, user: member, post: secPost as never })).toBe(false)
      expect(await canDownloadPost({ payload, user: contentAdmin, post: secPost as never })).toBe(
        false,
      )
      // End-to-end: the endpoint collapses a denied request to a 404 (existence oracle).
      const memberRes = await handleFileDownload({
        payload,
        user: member,
        postId: String(secPost.id),
        fileSn: secFileSn,
      })
      expect(memberRes.status).toBe(404)
      const contentRes = await handleFileDownload({
        payload,
        user: contentAdmin,
        postId: String(secPost.id),
        fileSn: secFileSn,
      })
      expect(contentRes.status).toBe(404)
    })

    it('ALLOWS a security-doc attachment to a privacy officer and to super', async () => {
      expect(await canDownloadPost({ payload, user: privacyOfficer, post: secPost as never })).toBe(
        true,
      )
      expect(await canDownloadPost({ payload, user: superUser, post: secPost as never })).toBe(true)
      const officerRes = await handleFileDownload({
        payload,
        user: privacyOfficer,
        postId: String(secPost.id),
        fileSn: secFileSn,
      })
      expect(officerRes.status).toBe(200)
    })

    it('does NOT regress ordinary attachments — member + content admin can still download', async () => {
      expect(await canDownloadPost({ payload, user: member, post: ordPost as never })).toBe(true)
      expect(await canDownloadPost({ payload, user: contentAdmin, post: ordPost as never })).toBe(
        true,
      )
    })

    // ── The raw /api/attachments[/file] door (round-3 fix) ──────────────────
    it('denormalizes securityDoc onto the security-doc post’s attachment', async () => {
      const media = await payload.findByID({
        collection: 'attachments',
        id: secMediaId,
        overrideAccess: true,
      })
      expect(media.securityDoc).toBe(true)
      const ord = await payload.findByID({
        collection: 'attachments',
        id: ordMediaId,
        overrideAccess: true,
      })
      expect(ord.securityDoc).toBeFalsy()
    })

    it('the raw attachments read (list + file route) DENIES a security-doc attachment to a content-only admin and a member', async () => {
      // findByID over the collection read access = the exact gate the REST
      // /api/attachments/:id and /api/attachments/file/:filename routes run.
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: secMediaId,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
      // List: the security-doc attachment is not present for a content admin.
      const listed = await payload.find({
        collection: 'attachments',
        user: contentAdmin,
        overrideAccess: false,
        pagination: false,
        limit: 0,
      })
      expect(listed.docs.map((d) => d.id)).not.toContain(secMediaId)
      // A member (no users.tenants) is denied entirely.
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: secMediaId,
          user: member,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('the raw attachments read ALLOWS a security-doc attachment to a privacy officer and super; ordinary stays readable by the content admin', async () => {
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: secMediaId,
          user: privacyOfficer,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: secMediaId,
          user: superUser,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()
      // No regression: an ORDINARY attachment is still readable by the tenant
      // content admin.
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: ordMediaId,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()
    })

    it('re-syncs the attachment securityDoc flag when the owning board flips (board→posts→attachments)', async () => {
      const board = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('FlipAttBoard'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
        },
        overrideAccess: true,
      })
      const flipMediaId = await makeAttachment()
      await payload.create({
        collection: 'posts',
        data: {
          board: board.id,
          title: marker('FlipAttPost'),
          attachments: [{ media: flipMediaId }],
        } as never,
        overrideAccess: true,
      })
      // Ordinary to start.
      const before = await payload.findByID({
        collection: 'attachments',
        id: flipMediaId,
        overrideAccess: true,
      })
      expect(before.securityDoc).toBeFalsy()
      // A content admin can read it now...
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: flipMediaId,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()

      // Flip the board → propagates to posts → propagates to their attachments.
      await payload.update({
        collection: 'boards',
        id: board.id,
        data: { securityDoc: true },
        overrideAccess: true,
      })

      const after = await payload.findByID({
        collection: 'attachments',
        id: flipMediaId,
        overrideAccess: true,
      })
      expect(after.securityDoc).toBe(true)
      // ...and the content admin can no longer read it via the raw route.
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: flipMediaId,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  // ── round-4: non-monotonic re-expose closed (ordinary post can't strip/ref) ─
  describe('security-doc attachment re-expose guard (round-4)', () => {
    const PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

    async function makeAttachment(): Promise<number> {
      const created = await payload.create({
        collection: 'attachments',
        data: { alt: 're-expose fixture', tenant: demoSiteId } as never,
        file: {
          data: Buffer.from(PNG, 'base64'),
          name: `sd-rx-${Date.now()}-${Math.floor(Math.random() * 100000)}.png`,
          mimetype: 'image/png',
          size: Buffer.from(PNG, 'base64').length,
        },
        overrideAccess: true,
      })
      return created.id as number
    }

    let secMediaId: number
    let secPostId: number
    let ordBoardId: number
    let contentAdmin: Awaited<ReturnType<typeof payload.create>>

    beforeAll(async () => {
      const secBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('RxSecBoard'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
          securityDoc: true,
        },
        overrideAccess: true,
      })
      secMediaId = await makeAttachment()
      const secPost = await payload.create({
        collection: 'posts',
        data: {
          board: secBoard.id,
          title: marker('RxSecPost'),
          attachments: [{ media: secMediaId }],
        } as never,
        overrideAccess: true,
      })
      secPostId = secPost.id

      const ordBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('RxOrdBoard'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
        },
        overrideAccess: true,
      })
      ordBoardId = ordBoard.id

      const contentRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_RX_${lettersOnly().toUpperCase()}`,
          name: 'Re-expose content role',
          description: 'content.boards + content.posts',
          menuGrants: [await menuId('content.boards'), await menuId('content.posts')],
        },
        overrideAccess: true,
      })
      contentAdmin = await payload.create({
        collection: 'users',
        data: {
          email: `sd-rx-content-${marker('e')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [contentRole.id],
          tenants: [{ tenant: demoSiteId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
    })

    it('the security-doc post marked its attachment securityDoc:true (recompute)', async () => {
      const media = await payload.findByID({
        collection: 'attachments',
        id: secMediaId,
        overrideAccess: true,
      })
      expect(media.securityDoc).toBe(true)
    })

    it('a content admin CANNOT create an ordinary post referencing a security-doc attachment (rejected at source)', async () => {
      await expect(
        payload.create({
          collection: 'posts',
          data: {
            board: ordBoardId,
            title: marker('RxAttack'),
            attachments: [{ media: secMediaId }],
          } as never,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      // The attachment's flag is UNCHANGED (not stripped) and the raw route
      // still denies the content admin.
      const media = await payload.findByID({
        collection: 'attachments',
        id: secMediaId,
        overrideAccess: true,
      })
      expect(media.securityDoc).toBe(true)
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: secMediaId,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('the source guard blocks even an overrideAccess ordinary write (fail-closed) — no shared reference can form', async () => {
      await expect(
        payload.create({
          collection: 'posts',
          data: {
            board: ordBoardId,
            title: marker('RxSystemOrd'),
            attachments: [{ media: secMediaId }],
          } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()
      const media = await payload.findByID({
        collection: 'attachments',
        id: secMediaId,
        overrideAccess: true,
      })
      expect(media.securityDoc).toBe(true)
    })

    it('recompute-any HEALS a stripped flag: a security-doc post re-save restores securityDoc:true', async () => {
      // Simulate a hypothetical strip (defense-in-depth backstop): force the
      // attachment ordinary, then re-save the security-doc post that references
      // it — the recompute-any sync (referenced-by-ANY-security-doc-post) restores
      // the flag, so it can never be permanently lowered while a §3 post holds it.
      await payload.update({
        collection: 'attachments',
        id: secMediaId,
        data: { securityDoc: false } as never,
        overrideAccess: true,
      })
      expect(
        (
          await payload.findByID({
            collection: 'attachments',
            id: secMediaId,
            overrideAccess: true,
          })
        ).securityDoc,
      ).toBe(false)

      await payload.update({
        collection: 'posts',
        id: secPostId,
        data: { author: marker('resave') },
        overrideAccess: true,
      })

      const healed = await payload.findByID({
        collection: 'attachments',
        id: secMediaId,
        overrideAccess: true,
      })
      expect(healed.securityDoc).toBe(true)
    })

    it('flipping the OWNING security-doc board to ordinary clears the flag (privileged) when no security-doc post references it', async () => {
      const board = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('RxFlipBoard'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
          securityDoc: true,
        },
        overrideAccess: true,
      })
      const mediaId = await makeAttachment()
      await payload.create({
        collection: 'posts',
        data: {
          board: board.id,
          title: marker('RxFlipPost'),
          attachments: [{ media: mediaId }],
        } as never,
        overrideAccess: true,
      })
      expect(
        (await payload.findByID({ collection: 'attachments', id: mediaId, overrideAccess: true }))
          .securityDoc,
      ).toBe(true)

      // Privileged flip security-doc → ordinary; no other security-doc post
      // references the attachment → it is cleared.
      await payload.update({
        collection: 'boards',
        id: board.id,
        data: { securityDoc: false },
        overrideAccess: true,
      })
      const after = await payload.findByID({
        collection: 'attachments',
        id: mediaId,
        overrideAccess: true,
      })
      expect(after.securityDoc).toBe(false)
    })

    it('ordinary attachments are unaffected — a content admin can reference a fresh attachment on an ordinary post', async () => {
      const freshId = await makeAttachment()
      const post = await payload.create({
        collection: 'posts',
        data: {
          board: ordBoardId,
          title: marker('RxOrdOk'),
          attachments: [{ media: freshId }],
        } as never,
        user: contentAdmin,
        overrideAccess: false,
      })
      expect(post.id).toBeDefined()
      const media = await payload.findByID({
        collection: 'attachments',
        id: freshId,
        overrideAccess: true,
      })
      expect(media.securityDoc).toBeFalsy()
    })
  })

  // ── round-5: richText-EMBEDDED attachments (the final reference site) ──────
  describe('richText-embedded security-doc attachments (round-5)', () => {
    const PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

    async function makeAttachment(): Promise<number> {
      const created = await payload.create({
        collection: 'attachments',
        data: { alt: 'embed fixture', tenant: demoSiteId } as never,
        file: {
          data: Buffer.from(PNG, 'base64'),
          name: `sd-embed-${Date.now()}-${Math.floor(Math.random() * 100000)}.png`,
          mimetype: 'image/png',
          size: Buffer.from(PNG, 'base64').length,
        },
        overrideAccess: true,
      })
      return created.id as number
    }

    /** A lexical body embedding an `attachments` upload node (the leak site). */
    function lexicalEmbedding(mediaId: number, text: string) {
      return {
        root: {
          type: 'root',
          format: '' as const,
          indent: 0,
          version: 1,
          direction: 'ltr' as const,
          children: [
            { type: 'upload', version: 3, relationTo: 'attachments', value: mediaId, fields: null },
            {
              type: 'paragraph',
              version: 1,
              direction: 'ltr' as const,
              format: '' as const,
              indent: 0,
              children: [
                { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 },
              ],
            },
          ],
        },
      }
    }

    let secBoardId: number
    let ordBoardId: number
    let embeddedMediaId: number
    let contentAdmin: Awaited<ReturnType<typeof payload.create>>
    let privacyOfficer: Awaited<ReturnType<typeof payload.create>>

    beforeAll(async () => {
      const secBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('EmbedSecBoard'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
          securityDoc: true,
        },
        overrideAccess: true,
      })
      secBoardId = secBoard.id
      const ordBoard = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('EmbedOrdBoard'),
          boardType: attachmentTypeId,
          attachmentsEnabled: true,
        },
        overrideAccess: true,
      })
      ordBoardId = ordBoard.id

      // A §3 post that embeds the attachment INLINE in content (NOT the array).
      embeddedMediaId = await makeAttachment()
      await payload.create({
        collection: 'posts',
        data: {
          board: secBoardId,
          title: marker('EmbedSecPost'),
          content: lexicalEmbedding(embeddedMediaId, 'security doc body with embedded file'),
        } as never,
        overrideAccess: true,
      })

      const contentRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_EMB_${lettersOnly().toUpperCase()}`,
          name: 'Embed content role',
          description: 'content.boards + content.posts',
          menuGrants: [await menuId('content.boards'), await menuId('content.posts')],
        },
        overrideAccess: true,
      })
      contentAdmin = await payload.create({
        collection: 'users',
        data: {
          email: `sd-emb-content-${marker('e')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [contentRole.id],
          tenants: [{ tenant: demoSiteId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })

      const privacyRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_EMBP_${lettersOnly().toUpperCase()}`,
          name: 'Embed privacy role',
          description: 'privacy.securityDocs',
          menuGrants: [await menuId(SECURITY_DOCS_MENU_KEY)],
        },
        overrideAccess: true,
      })
      privacyOfficer = await payload.create({
        collection: 'users',
        data: {
          email: `sd-emb-privacy-${marker('e')}@example.com`.toLowerCase(),
          password: TEST_PASSWORD,
          roles: [privacyRole.id],
          tenants: [{ tenant: demoSiteId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
    })

    it('(i) a richText-embedded attachment in a §3 post is flagged securityDoc:true and denied to a content admin on the raw route', async () => {
      const media = await payload.findByID({
        collection: 'attachments',
        id: embeddedMediaId,
        overrideAccess: true,
      })
      expect(media.securityDoc).toBe(true)

      await expect(
        payload.findByID({
          collection: 'attachments',
          id: embeddedMediaId,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
      // The privacy officer can read it.
      await expect(
        payload.findByID({
          collection: 'attachments',
          id: embeddedMediaId,
          user: privacyOfficer,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()
    })

    it('(ii) an ordinary post embedding a §3 attachment via content richText is REJECTED at the source', async () => {
      await expect(
        payload.create({
          collection: 'posts',
          data: {
            board: ordBoardId,
            title: marker('EmbedAttackContent'),
            content: lexicalEmbedding(embeddedMediaId, 're-expose attempt via content'),
          } as never,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
      // Even a privileged overrideAccess ordinary write is rejected (fail-closed).
      await expect(
        payload.create({
          collection: 'posts',
          data: {
            board: ordBoardId,
            title: marker('EmbedAttackContentSys'),
            content: lexicalEmbedding(embeddedMediaId, 're-expose attempt via content (system)'),
          } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()
      // The flag is unchanged.
      const media = await payload.findByID({
        collection: 'attachments',
        id: embeddedMediaId,
        overrideAccess: true,
      })
      expect(media.securityDoc).toBe(true)
    })

    it('(ii-answer) an ordinary post embedding a §3 attachment via the ANSWER richText is REJECTED too', async () => {
      await expect(
        payload.create({
          collection: 'posts',
          data: {
            board: ordBoardId,
            title: marker('EmbedAttackAnswer'),
            answer: lexicalEmbedding(embeddedMediaId, 're-expose attempt via answer'),
          } as never,
          user: contentAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('the reverse direction is allowed: a §3 post may embed the §3 attachment (answer site) and an ordinary post may embed a FRESH ordinary attachment', async () => {
      // §3 Q&A post embedding the secure attachment in its answer → allowed.
      const secQna = await payload.create({
        collection: 'posts',
        data: {
          board: secBoardId,
          title: marker('EmbedSecAnswer'),
          answer: lexicalEmbedding(embeddedMediaId, 'answer embedding the §3 file'),
        } as never,
        overrideAccess: true,
      })
      expect(secQna.id).toBeDefined()

      // Ordinary post embedding a FRESH ordinary attachment → allowed, stays ordinary.
      const freshId = await makeAttachment()
      const ord = await payload.create({
        collection: 'posts',
        data: {
          board: ordBoardId,
          title: marker('EmbedOrdOk'),
          content: lexicalEmbedding(freshId, 'ordinary body with a fresh embed'),
        } as never,
        user: contentAdmin,
        overrideAccess: false,
      })
      expect(ord.id).toBeDefined()
      const media = await payload.findByID({
        collection: 'attachments',
        id: freshId,
        overrideAccess: true,
      })
      expect(media.securityDoc).toBeFalsy()
    })
  })
})
