import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { handleFileDownload } from '@/endpoints/fileDownload'
import { handleDownloadStats, handleDownloadStatsExport } from '@/endpoints/downloadStatsExport'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { boardTypesStep, SEED_BOARD_TYPES } from '@/seed/steps/boardTypes'
import { sitesStep } from '@/seed/steps/sites'

/**
 * Task 5B — D5 (download-count atomicity + status gating) and download
 * statistics (TODO 5.3, ref 2-18). Boots real Payload against Postgres.
 */

let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

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
async function adminMenuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id
}
async function makeSite(): Promise<number> {
  const site = await payload.create({
    collection: 'sites',
    data: {
      siteId: uniqueSiteId('dl'),
      name: 'DL Site',
      url: 'https://dl.example.com',
      isAdminSite: false,
    },
    overrideAccess: true,
  })
  return site.id
}
async function boardTypeId(): Promise<number> {
  const code = SEED_BOARD_TYPES[0]!.code
  const found = await payload.find({
    collection: 'boardTypes',
    where: { code: { equals: code } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id
}
async function makeBoard(tenantId: number, name: string): Promise<number> {
  const board = await payload.create({
    collection: 'boards',
    data: {
      tenant: tenantId,
      name,
      boardType: await boardTypeId(),
      attachmentsEnabled: true,
      attachmentMaxCount: 5,
    },
    overrideAccess: true,
  })
  return board.id
}
async function createAttachment(name: string, tenantId: number): Promise<number> {
  const doc = await payload.create({
    collection: 'attachments',
    data: { alt: name, tenant: tenantId } as never,
    file: { data: PNG_1x1, name, mimetype: 'image/png', size: PNG_1x1.length },
    overrideAccess: true,
  })
  return doc.id
}
/** Creates a post with the given attachments, then force-sets their downloadCounts. */
async function makePostWithCounts(
  tenantId: number,
  boardId: number,
  title: string,
  files: { name: string; count: number }[],
): Promise<number> {
  const attachments: Record<string, unknown>[] = []
  for (const f of files) {
    attachments.push({ media: await createAttachment(f.name, tenantId), description: f.name })
  }
  const post = await payload.create({
    collection: 'posts',
    data: { board: boardId, title, attachments } as never,
    overrideAccess: true,
  })
  const fresh = await payload.findByID({
    collection: 'posts',
    id: post.id,
    depth: 0,
    overrideAccess: true,
  })
  const updated = (fresh.attachments ?? []).map((a, i) => ({
    ...a,
    downloadCount: files[i]!.count,
  }))
  await payload.update({
    collection: 'posts',
    id: post.id,
    data: { attachments: updated } as never,
    overrideAccess: true,
    context: { skipPostSideEffects: true },
  })
  return post.id
}
async function makeSuper(): Promise<Record<string, unknown>> {
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: `ROLE_DLSUP_${lettersOnly().toUpperCase()}`,
      name: 'dl super',
      description: 'isSuper',
      isSuper: true,
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: `dlsup-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`,
      password: TEST_PASSWORD,
      roles: [role.id],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}
/** A scoped admin holding `statistics.downloads` on the given tenant(s). */
async function makeDownloadsAdmin(tenantIds: number[]): Promise<Record<string, unknown>> {
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: `ROLE_DL_${lettersOnly().toUpperCase()}`,
      name: 'downloads',
      description: 'downloads grant',
      menuGrants: [await adminMenuId('statistics.downloads')],
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: `dl-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`,
      password: TEST_PASSWORD,
      roles: [role.id],
      tenants: tenantIds.map((t) => ({ tenant: t })),
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}
async function countOf(postId: number, index: number): Promise<number> {
  const post = await payload.findByID({
    collection: 'posts',
    id: postId,
    depth: 0,
    overrideAccess: true,
  })
  return post.attachments?.[index]?.downloadCount ?? 0
}
type MutableUpload = { handlers?: unknown[] }
function attachmentsUpload(): MutableUpload {
  return (payload.collections as Record<string, { config: { upload: MutableUpload } }>).attachments!
    .config.upload
}

describe('Task 5B — download-count atomicity (D5) + download statistics', () => {
  let superUser: Record<string, unknown>

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])
    superUser = await makeSuper()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete attachmentsUpload().handlers
  })

  // ── Part 0 — D5: atomic increment + status gating ────────────────────────
  describe('D5 — downloadCount is atomic + only counts a truly-served 200', () => {
    it('a real 200 download increments exactly once (local driver)', async () => {
      const siteId = await makeSite()
      const boardId = await makeBoard(siteId, 'D5 Board')
      const postId = await makePostWithCounts(siteId, boardId, 'D5 post', [
        { name: `d5-${lettersOnly()}.png`, count: 0 },
      ])
      expect(await countOf(postId, 0)).toBe(0)

      const res = await handleFileDownload({
        payload,
        user: superUser,
        postId: String(postId),
        fileSn: 1,
      })
      expect(res.status).toBe(200)
      expect(await countOf(postId, 0)).toBe(1)

      const res2 = await handleFileDownload({
        payload,
        user: superUser,
        postId: String(postId),
        fileSn: 1,
      })
      expect(res2.status).toBe(200)
      expect(await countOf(postId, 0)).toBe(2)
    })

    it('N concurrent downloads increment by EXACTLY N (atomic — no lost updates)', async () => {
      const siteId = await makeSite()
      const boardId = await makeBoard(siteId, 'D5 Concurrent Board')
      const postId = await makePostWithCounts(siteId, boardId, 'D5 concurrent post', [
        { name: `d5c-${lettersOnly()}.png`, count: 0 },
      ])

      const N = 8
      const results = await Promise.all(
        Array.from({ length: N }, () =>
          handleFileDownload({ payload, user: superUser, postId: String(postId), fileSn: 1 }),
        ),
      )
      expect(results.every((r) => r.status === 200)).toBe(true)
      // The old whole-array read-modify-write would LOSE updates here (< N);
      // the atomic single-column UPDATE lands all N.
      expect(await countOf(postId, 0)).toBe(N)
    })

    it('a 304 Not Modified (S3) does NOT increment', async () => {
      const siteId = await makeSite()
      const boardId = await makeBoard(siteId, 'D5 304 Board')
      const postId = await makePostWithCounts(siteId, boardId, 'D5 304 post', [
        { name: `d5-304-${lettersOnly()}.png`, count: 4 },
      ])
      attachmentsUpload().handlers = [vi.fn(async () => new Response(null, { status: 304 }))]
      vi.stubEnv('STORAGE_DRIVER', 's3')

      const res = await handleFileDownload({
        payload,
        user: superUser,
        postId: String(postId),
        fileSn: 1,
      })
      expect(res.status).toBe(304)
      expect(await countOf(postId, 0)).toBe(4) // unchanged
    })

    it('a 206 Partial Content (S3 range) does NOT increment', async () => {
      const siteId = await makeSite()
      const boardId = await makeBoard(siteId, 'D5 206 Board')
      const postId = await makePostWithCounts(siteId, boardId, 'D5 206 post', [
        { name: `d5-206-${lettersOnly()}.png`, count: 2 },
      ])
      attachmentsUpload().handlers = [
        vi.fn(async () => new Response(new Uint8Array(PNG_1x1.subarray(0, 10)), { status: 206 })),
      ]
      vi.stubEnv('STORAGE_DRIVER', 's3')

      const res = await handleFileDownload({
        payload,
        user: superUser,
        postId: String(postId),
        fileSn: 1,
      })
      expect(res.status).toBe(206)
      expect(await countOf(postId, 0)).toBe(2) // unchanged
    })

    it('a concurrent download does NOT clobber a concurrent admin attachment edit', async () => {
      const siteId = await makeSite()
      const boardId = await makeBoard(siteId, 'D5 Clobber Board')
      const postId = await makePostWithCounts(siteId, boardId, 'D5 clobber post', [
        { name: `d5-e1-${lettersOnly()}.png`, count: 0 },
        { name: `d5-e2-${lettersOnly()}.png`, count: 0 },
      ])

      // Concurrently: admin edits attachment #1's description while a download of
      // attachment #2 bumps its counter. The download's targeted single-column
      // UPDATE never rewrites the array, so the admin's edit to #1 survives.
      const fresh = await payload.findByID({
        collection: 'posts',
        id: postId,
        depth: 0,
        overrideAccess: true,
      })
      const edited = (fresh.attachments ?? []).map((a, i) =>
        i === 0 ? { ...a, description: 'EDITED-BY-ADMIN' } : { ...a },
      )
      await Promise.all([
        handleFileDownload({ payload, user: superUser, postId: String(postId), fileSn: 2 }),
        payload.update({
          collection: 'posts',
          id: postId,
          data: { attachments: edited } as never,
          overrideAccess: true,
          context: { skipPostSideEffects: true },
        }),
      ])

      const after = await payload.findByID({
        collection: 'posts',
        id: postId,
        depth: 0,
        overrideAccess: true,
      })
      // D5 core guarantee: the download's SCOPED single-column update never
      // rewrites the whole array, so it can NEVER revert the admin's edit to a
      // sibling attachment. (The old whole-array read-modify-write could clobber
      // it.) The reverse — an admin's own full-post save overwriting an in-flight
      // counter — is inherent to a counter-in-array and is out of D5's scope.
      expect(after.attachments?.[0]?.description).toBe('EDITED-BY-ADMIN')

      // The counter itself still functions after the concurrent admin save.
      const before = await countOf(postId, 1)
      const res = await handleFileDownload({
        payload,
        user: superUser,
        postId: String(postId),
        fileSn: 2,
      })
      expect(res.status).toBe(200)
      expect(await countOf(postId, 1)).toBe(before + 1)
    })
  })

  // ── Part 1 — download statistics ─────────────────────────────────────────
  describe('download statistics: TOP-N + detail + tenant scoping + gated + export', () => {
    it('reports totals, the TOP list, and tenant-scoped export; cross-tenant denied', async () => {
      const siteA = await makeSite()
      const siteB = await makeSite()
      const boardA = await makeBoard(siteA, 'Stats Board A')
      const boardB = await makeBoard(siteB, 'Stats Board B')

      await makePostWithCounts(siteA, boardA, 'Popular report', [
        { name: `popular-${lettersOnly()}.pdf`, count: 40 },
      ])
      await makePostWithCounts(siteA, boardA, 'Quiet memo', [
        { name: `quiet-${lettersOnly()}.pdf`, count: 3 },
      ])
      await makePostWithCounts(siteB, boardB, 'Site-B secret file', [
        { name: `bsecret-${lettersOnly()}.pdf`, count: 99 },
      ])

      const adminA = await makeDownloadsAdmin([siteA])
      const reqA = { user: adminA, payload } as never

      // JSON stats for site A: total 43, popular first.
      const jsonResp = await handleDownloadStats({
        payload,
        req: reqA,
        searchParams: new URLSearchParams(`site=${siteA}`),
      })
      expect(jsonResp.status).toBe(200)
      const body = (await jsonResp.json()) as {
        stats: { totalDownloads: number; fileCount: number; top: { postTitle: string }[] }
      }
      expect(body.stats.totalDownloads).toBe(43)
      expect(body.stats.fileCount).toBe(2)
      expect(body.stats.top[0]!.postTitle).toBe('Popular report')
      expect(JSON.stringify(body.stats)).not.toContain('Site-B secret file')

      // CSV export for site A carries the rows, NOT site B's.
      const csvResp = await handleDownloadStatsExport({
        payload,
        req: reqA,
        searchParams: new URLSearchParams(`site=${siteA}`),
      })
      expect(csvResp.status).toBe(200)
      const csv = await csvResp.text()
      expect(csv).toContain('Popular report')
      expect(csv).toContain('40')
      expect(csv).not.toContain('Site-B secret file')

      // Same admin exporting site B (unassigned) → EMPTY (no B rows).
      const crossResp = await handleDownloadStats({
        payload,
        req: reqA,
        searchParams: new URLSearchParams(`site=${siteB}`),
      })
      const crossBody = (await crossResp.json()) as { stats: { totalDownloads: number } }
      expect(crossBody.stats.totalDownloads).toBe(0)

      // Missing site → 400.
      const badResp = await handleDownloadStats({
        payload,
        req: reqA,
        searchParams: new URLSearchParams(''),
      })
      expect(badResp.status).toBe(400)

      // A roleless user → 403 for both JSON + CSV.
      const roleless = await payload.create({
        collection: 'users',
        data: {
          email: `dl-norole-${Date.now()}@example.com`,
          password: TEST_PASSWORD,
          roles: [],
          tenants: [{ tenant: siteA }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      const reqNone = { user: roleless, payload } as never
      const deniedJson = await handleDownloadStats({
        payload,
        req: reqNone,
        searchParams: new URLSearchParams(`site=${siteA}`),
      })
      expect(deniedJson.status).toBe(403)
      const deniedCsv = await handleDownloadStatsExport({
        payload,
        req: reqNone,
        searchParams: new URLSearchParams(`site=${siteA}`),
      })
      expect(deniedCsv.status).toBe(403)
    })
  })
})
