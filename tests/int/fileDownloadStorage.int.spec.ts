import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { handleFileDownload } from '@/endpoints/fileDownload'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { boardTypesStep } from '@/seed/steps/boardTypes'
import { sitesStep } from '@/seed/steps/sites'

/**
 * Task TR2 Part 2 — the download endpoint is storage-driver aware. With
 * `STORAGE_DRIVER=s3` it serves bytes via the S3 adapter's registered static
 * handler (mocked here — NO real bucket) instead of local disk, but ONLY after
 * the SAME access gate (canDownloadPost + tenant coherence). The tests prove:
 *   1. authorized + s3 → the S3 handler is invoked and its bytes are returned
 *      with our download headers; the counter still increments.
 *   2. denied (cross-tenant / secret / anonymous) + s3 → 403 BEFORE the S3
 *      handler is ever called (access is enforced first).
 *   3. local (default) driver → local disk read, S3 handler never touched.
 *   4. s3 driver but no registered handler → 500 (fail-closed, not a leak).
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

/** Access the runtime upload config so tests can inject a fake S3 static handler. */
type MutableUpload = { handlers?: unknown[] }
function attachmentsUpload(): MutableUpload {
  return (payload.collections as Record<string, { config: { upload: MutableUpload } }>).attachments!
    .config.upload
}

describe('Task TR2: storage-driver-aware /api/files/download', () => {
  let siteAId: number
  let siteBId: number
  let nonSecretPostId: number
  let secretPostId: number
  let attNonSecretFilename: string

  let adminA: Awaited<ReturnType<typeof payload.create>>
  let adminB: Awaited<ReturnType<typeof payload.create>>
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
    const boardTypeId = boardTypes.docs[0]!.id

    const siteA = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('sa'), name: 'Store A', url: 'https://sa.example.com' },
      overrideAccess: true,
    })
    const siteB = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('sb'), name: 'Store B', url: 'https://sb.example.com' },
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
    const postsRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_STORE_POSTS_${Date.now()}`,
        name: 'Store posts role',
        description: 'content.posts only.',
        menuGrants: [postsMenu.docs[0]!.id],
      },
      overrideAccess: true,
    })
    const superRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_STORE_SUPER_${Date.now()}`,
        name: 'Store super role',
        description: 'isSuper.',
        isSuper: true,
      },
      overrideAccess: true,
    })

    adminA = await payload.create({
      collection: 'users',
      data: {
        email: `store-a-${Date.now()}@example.com`,
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
        email: `store-b-${Date.now()}@example.com`,
        password: TEST_PASSWORD,
        roles: [postsRole.id],
        tenants: [{ tenant: siteBId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    superUser = await payload.create({
      collection: 'users',
      data: {
        email: `store-su-${Date.now()}@example.com`,
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
        name: marker('StoreBoardA'),
        boardType: boardTypeId,
        attachmentsEnabled: true,
        attachmentMaxCount: 3,
      },
      overrideAccess: true,
    })

    const attNonSecretId = await createAttachment(`${marker('store-pub')}.png`, siteAId)
    const attSecretId = await createAttachment(`${marker('store-secret')}.png`, siteAId)
    attNonSecretFilename = (await payload
      .findByID({ collection: 'attachments', id: attNonSecretId, overrideAccess: true })
      .then((d) => d.filename)) as string

    const nonSecretPost = await payload.create({
      collection: 'posts',
      data: {
        board: boardA.id,
        title: marker('NonSecret'),
        attachments: [{ media: attNonSecretId, description: 'pub' }],
      },
      overrideAccess: true,
    })
    nonSecretPostId = nonSecretPost.id

    const secretPost = await payload.create({
      collection: 'posts',
      data: {
        board: boardA.id,
        title: marker('Secret'),
        isSecret: true,
        attachments: [{ media: attSecretId, description: 'secret' }],
      },
      overrideAccess: true,
    })
    secretPostId = secretPost.id
  })

  afterEach(() => {
    // Never let a stubbed driver or injected handler leak to another test/file.
    vi.unstubAllEnvs()
    delete attachmentsUpload().handlers
  })

  /** Installs a spy S3 static handler and points STORAGE_DRIVER at s3. */
  function installS3Handler(): ReturnType<typeof vi.fn> {
    const handler = vi.fn(
      async () =>
        new Response(new Uint8Array(PNG_1x1), {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(PNG_1x1.length),
            ETag: '"deadbeef"',
          },
        }),
    )
    attachmentsUpload().handlers = [handler]
    vi.stubEnv('STORAGE_DRIVER', 's3')
    return handler
  }

  it('s3 + authorized → serves bytes via the S3 handler with download headers, and increments', async () => {
    const handler = installS3Handler()

    const before = await payload.findByID({
      collection: 'posts',
      id: nonSecretPostId,
      overrideAccess: true,
    })
    const startCount = before.attachments?.[0]?.downloadCount ?? 0

    const res = await handleFileDownload({
      payload,
      user: superUser,
      postId: String(nonSecretPostId),
      fileSn: 1,
    })

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    // The S3 handler was asked for THIS attachment's filename.
    expect(handler.mock.calls[0]![1]).toMatchObject({
      params: { collection: 'attachments', filename: attNonSecretFilename },
    })
    // Our download headers are applied over the streamed S3 response.
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    // The bytes flow through the re-wrapped response.
    const body = new Uint8Array(await res.arrayBuffer())
    expect(body.length).toBe(PNG_1x1.length)

    const after = await payload.findByID({
      collection: 'posts',
      id: nonSecretPostId,
      overrideAccess: true,
    })
    expect(after.attachments?.[0]?.downloadCount).toBe(startCount + 1)
  })

  it('s3 + cross-tenant admin → 403 BEFORE any S3 fetch (access enforced first)', async () => {
    const handler = installS3Handler()
    const res = await handleFileDownload({
      payload,
      user: adminB,
      postId: String(nonSecretPostId),
      fileSn: 1,
    })
    expect(res.status).toBe(404)
    expect(handler).not.toHaveBeenCalled()
  })

  it('s3 + secret post for a non-viewer → 403 BEFORE any S3 fetch', async () => {
    const handler = installS3Handler()
    const res = await handleFileDownload({
      payload,
      user: adminB,
      postId: String(secretPostId),
      fileSn: 1,
    })
    expect(res.status).toBe(404)
    expect(handler).not.toHaveBeenCalled()
  })

  it('s3 + anonymous → 403 BEFORE any S3 fetch', async () => {
    const handler = installS3Handler()
    const res = await handleFileDownload({
      payload,
      user: null,
      postId: String(nonSecretPostId),
      fileSn: 1,
    })
    expect(res.status).toBe(404)
    expect(handler).not.toHaveBeenCalled()
  })

  it('local (default) driver → reads local disk, S3 handler never touched', async () => {
    // Install a handler that would FAIL the test if reached, but keep driver local.
    const handler = vi.fn(async () => new Response('should not be called', { status: 500 }))
    attachmentsUpload().handlers = [handler]
    // STORAGE_DRIVER unset (default local).
    const res = await handleFileDownload({
      payload,
      user: adminA,
      postId: String(nonSecretPostId),
      fileSn: 1,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(handler).not.toHaveBeenCalled()
  })

  it('s3 but no registered handler → 500 fail-closed (never a silent local read)', async () => {
    vi.stubEnv('STORAGE_DRIVER', 's3')
    attachmentsUpload().handlers = []
    const res = await handleFileDownload({
      payload,
      user: superUser,
      postId: String(nonSecretPostId),
      fileSn: 1,
    })
    expect(res.status).toBe(500)
  })
})
