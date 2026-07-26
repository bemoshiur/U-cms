import { sql } from '@payloadcms/db-postgres'
import fsPromises from 'fs/promises'
import path from 'path'
import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess, isSuperUser } from '../access/hasMenuAccess'
import { SECURITY_DOCS_MENU_KEY } from '../access/securityDocs'
import { getAssignedTenantIds } from '../access/tenantAccess'
import { toRelationId } from '../collections/utils'
import { POSTS_MENU_KEY } from '../collections/posts/defaults'
import type { Post } from '../payload-types'
import { findAccessibleDoc, notFoundResponse } from '../security/existenceOracle'

/**
 * Secure managed download endpoint (Task 3B Part 3; ref 1-81 — replaces the
 * legacy `fileDown.do`). Canonical copyable URL:
 *
 *   GET /api/files/download?post={postId}&fileSn={n}
 *
 * This is the ONLY sanctioned way to fetch a board attachment. It:
 *   1. Enforces access — the requester must be allowed to VIEW the post
 *      (tenant scoping + secret-post rule), never a raw static file path.
 *   2. Increments the attachment's `downloadCount`.
 *   3. Streams the bytes back with a proper Content-Disposition + Content-Type,
 *      resolving the file by attachment reference — the direct storage path is
 *      never exposed.
 *
 * ## SECURITY — the /api/media/file gap (CLOSED, Task 4-zero)
 *
 * Previously `media.read` was public AND `/api/media/file/*` was IP-exempt, so a
 * board attachment was reachable UNAUTHENTICATED at `/api/media/file/<filename>`,
 * bypassing this endpoint's access checks; and any authenticated admin could
 * list every tenant's (and secret posts') files via `/api/media`. Task 4-zero
 * closes this FULLY: board/post + admin-notice attachments were moved out of the
 * public `media` pool into the tenant-scoped `attachments` collection
 * (`src/collections/Attachments.ts`, opted into the multi-tenant plugin, read
 * gated by tenant membership). So `/api/attachments` and `/api/attachments/file`
 * deny cross-tenant and anonymous callers, and `/api/media/file` (re-opened as
 * the deliberate public logo path) can no longer serve any attachment because
 * none live in `media` anymore. This endpoint remains the ONE sanctioned
 * attachment-fetch path and the raw attachment route never diverges from it into
 * a public hole.
 *
 * ## IP guard / public reachability (Task 4B seam #4 — now OPEN)
 *
 * `/api/files/download` is now EXEMPT from the Task 2C admin IP allowlist (see
 * `EXEMPT_API_PREFIXES`), so a logged-in MEMBER on the public site can reach it.
 * This is safe because `canDownloadPost` is the sole gate and DENIES anonymous
 * requests outright (members-only download of non-secret posts; secret/cross-
 * tenant still gated) — the exemption removes only the network allowlist, never
 * the visibility check. `/api/attachments/file` MUST stay GUARDED (not exempt):
 * only this endpoint's `canDownloadPost` gate is the sanctioned member seam.
 *
 * ## S3 / storage-driver awareness (Task TR2 Part 2)
 *
 * The access + counter logic is storage-AGNOSTIC; only the final byte SOURCE
 * differs by `STORAGE_DRIVER` (resolved the SAME way `payload.config.ts` gates
 * storage):
 *   - `local` (dev/default): read from the local upload dir (unchanged).
 *   - `s3`: the `@payloadcms/storage-s3` adapter is active and registers a
 *     static handler on the `attachments` collection's `upload.handlers`. We
 *     call THAT handler to stream the object out of the bucket (it also supports
 *     a signed-URL redirect if `signedDownloads` is configured — we don't, so it
 *     streams), then re-wrap it with our download headers. This is required on
 *     Vercel, whose filesystem is ephemeral (a file uploaded in one invocation
 *     is not on disk in another).
 *
 * CRITICAL: the storage branch runs ONLY AFTER `canDownloadPost` + the
 * tenant-coherence check have passed. The access decision is identical for both
 * drivers — the S3 handler is never reached for a secret/cross-tenant/anonymous
 * request. See the tests in `tests/int/fileDownloadStorage.int.spec.ts`.
 */

type PostLike = {
  id: string | number
  tenant?: unknown
  authorUser?: unknown
  attachments?: unknown
  isSecret?: unknown
  securityDoc?: unknown
}

/**
 * True when the acting principal is a TENANT-SCOPED ADMIN (`users`) rather than
 * a public-site member or an anonymous visitor. On a real request `req.user`
 * carries `collection`; Local-API callers (tests) pass a bare doc without it, so
 * we fall back to "has a `roles` field" — admin `users` always do, `members`
 * never do. This is what keeps the admin download surface tenant-scoped (a
 * cross-tenant admin stays denied) while the member branch below opens.
 */
function isTenantScopedAdmin(user: unknown): boolean {
  if (!user || typeof user !== 'object') {
    return false
  }
  const collection = (user as { collection?: unknown }).collection
  if (collection === 'members') {
    return false
  }
  if (collection === 'users') {
    return true
  }
  return 'roles' in (user as object)
}

function json(status: number, message: string): Response {
  return Response.json({ ok: false, message }, { status })
}

/**
 * Access decision for downloading a post's attachment — the single visibility
 * gate. The policy has TWO audiences (Task 4B seam #4):
 *
 *  - ADMIN surface (`users`): unchanged from Phase 3 — super always; the post's
 *    author always (incl. secret); an admin holding `content.posts` AND assigned
 *    to the post's tenant (secret posts included). A CROSS-TENANT admin stays
 *    denied (the Task 4-zero confidentiality invariant). This branch is
 *    identical to before, so every prior admin/secret/cross-tenant test holds.
 *  - PUBLIC surface (logged-in MEMBER): a member may download a NON-SECRET
 *    post's attachment ON THEIR OWN SITE (member.tenant == post.tenant). A member
 *    of site A is DENIED a site-B (or admin `bos`) attachment even when non-secret
 *    — the member branch enforces the same tenant boundary the admin branch does.
 *    SECRET posts require the admin/author branch, so a member (even one who
 *    authored a secret post — a documented T4C refinement) is denied a secret
 *    file. ANONYMOUS (no session) is DENIED for everything — preserving Task
 *    4-zero's "nothing fetchable unauthenticated" invariant. The policy is
 *    therefore MEMBERS-ONLY + SAME-SITE (not fully public); see task-4B-report.md.
 *
 * Because anonymous is denied here, `/api/files/download` can be safely exempted
 * from the admin IP guard (so member sessions reach it) — the gate is this
 * function, not the network allowlist.
 */
export async function canDownloadPost(args: {
  payload: Payload
  user: unknown
  post: PostLike
}): Promise<boolean> {
  const { payload, user, post } = args
  // Anonymous is denied for EVERYTHING (Task 4-zero criterion 5).
  if (!user) {
    return false
  }

  // §3 SECURITY-DOCUMENT posts (Task 6D C1 — file endpoint). The attachment bytes
  // are as confidential as the post: this endpoint is IP-exempt and fetches the
  // post with `overrideAccess`, so it must reproduce `securityDocScopedAccess`
  // here or a self-registered MEMBER (anyone can /signup) on the same tenant, or
  // a content-only admin WITHOUT `privacy.securityDocs`, could pull a security-doc
  // file by enumerable postId+fileSn. Policy: ONLY an admin (`users`) holding
  // `privacy.securityDocs` — or `isSuper` — may download, and only within the
  // post's tenant. Members and non-privacy admins are DENIED (→ the shared 404).
  // No author shortcut here: the §3 grant is the sole key.
  if (post.securityDoc === true) {
    if (!isTenantScopedAdmin(user)) {
      return false // members + any non-admin principal → denied
    }
    if (isSuperUser(user)) {
      return true
    }
    const tenantId = toRelationId(post.tenant)
    if (tenantId === undefined) {
      return false
    }
    const assigned = getAssignedTenantIds(user).some((id) => String(id) === String(tenantId))
    if (!assigned) {
      return false
    }
    return hasMenuAccess({ payload, user } as unknown as PayloadRequest, SECURITY_DOCS_MENU_KEY)
  }

  if (isTenantScopedAdmin(user)) {
    if (isSuperUser(user)) {
      return true
    }
    const userId = (user as { id?: unknown }).id
    const authorId = toRelationId(post.authorUser)
    if (authorId !== undefined && userId !== undefined && String(authorId) === String(userId)) {
      return true
    }
    const tenantId = toRelationId(post.tenant)
    if (tenantId === undefined) {
      return false
    }
    const assigned = getAssignedTenantIds(user).some((id) => String(id) === String(tenantId))
    if (!assigned) {
      return false
    }
    // `hasMenuAccess` only reads `req.user` + `req.payload`, so a minimal
    // request shape is sufficient here (no HTTP request in this call path).
    return hasMenuAccess({ payload, user } as unknown as PayloadRequest, POSTS_MENU_KEY)
  }

  // Authenticated public-site MEMBER (or any non-admin authed principal): a
  // NON-SECRET post ON THE MEMBER'S OWN SITE (tenant) only. The tenant check is
  // LOAD-BEARING: `/api/files/download` is IP-exempt and the post is fetched with
  // `overrideAccess`, so this function is the ONLY tenant gate on that path.
  // Without it a member of site A could enumerate post ids and download any
  // non-secret attachment from ANY other tenant — another customer site, or the
  // admin `bos` site. Mirrors the admin branch's tenant comparison. Secret posts
  // require the admin/author branch above (member-owned-secret is a documented
  // T4C refinement).
  if (post.isSecret === true) {
    return false
  }
  const memberTenantId = toRelationId((user as { tenant?: unknown }).tenant)
  const postTenantId = toRelationId(post.tenant)
  if (memberTenantId === undefined || postTenantId === undefined) {
    return false
  }
  return String(memberTenantId) === String(postTenantId)
}

/** Resolves the local upload dir for a collection (default staticDir = slug). */
function resolveStaticDir(payload: Payload, collectionSlug: 'attachments'): string {
  const collection = payload.collections?.[collectionSlug]
  const upload = collection?.config?.upload
  const staticDir =
    (upload && typeof upload === 'object' && (upload as { staticDir?: string }).staticDir) ||
    collectionSlug
  return path.resolve(staticDir)
}

/** RFC 5987 Content-Disposition value that never breaks on quotes/newlines/unicode. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/["\r\n]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/**
 * The active storage driver, resolved the SAME way `payload.config.ts` gates
 * storage. Read at call time (not module load) so tests can flip it per-case.
 */
function getStorageDriver(): 'local' | 's3' {
  return process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local'
}

/** Security headers applied to every successfully-served attachment. */
function withDownloadHeaders(headers: Headers, filename: string, mimeType?: string): Headers {
  if (!headers.has('Content-Disposition')) {
    headers.set('Content-Disposition', contentDisposition(filename))
  }
  if (mimeType && !headers.has('Content-Type')) {
    headers.set('Content-Type', mimeType)
  }
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Cache-Control', 'private, no-store')
  return headers
}

/**
 * The S3 static handler the cloud-storage plugin registers on a collection's
 * `upload.handlers` (it is pushed last). Loose type — we only ever CALL it.
 */
type AttachmentStaticHandler = (
  req: PayloadRequest,
  args: { headers?: Headers; params: { collection: string; filename: string } },
) => Promise<Response> | Response

/**
 * Local-disk byte source (dev/default driver) — unchanged from the pre-TR2
 * behavior. Reads the file into memory and returns a fully-buffered Response, or
 * a 4xx error Response (400 traversal guard / 404 missing) that the caller
 * returns as-is WITHOUT incrementing the counter.
 */
async function serveAttachmentFromLocalDisk(args: {
  payload: Payload
  filename: string
  mimeType?: string
  mediaId: string | number
}): Promise<Response> {
  const { payload, filename, mimeType, mediaId } = args

  // Resolve the byte path with a strict traversal guard (mirrors Payload's own
  // getFileHandler): the resolved path must stay inside the upload dir.
  const dir = resolveStaticDir(payload, 'attachments')
  const filePath = path.resolve(dir, filename)
  if (
    filePath !== path.join(dir, path.basename(filename)) ||
    !filePath.startsWith(dir + path.sep)
  ) {
    return json(400, 'Invalid file reference.')
  }

  let bytes: Buffer
  try {
    bytes = await fsPromises.readFile(filePath)
  } catch {
    payload.logger?.error?.(
      `[fileDownload] missing file on disk for media ${mediaId} (${filename}).`,
    )
    return json(404, 'File not found.')
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: withDownloadHeaders(
      new Headers({ 'Content-Length': String(bytes.length) }),
      filename,
      mimeType,
    ),
  })
}

/**
 * S3 byte source (`STORAGE_DRIVER=s3`). Calls the S3 static handler the
 * `@payloadcms/storage-s3` adapter registered on the `attachments` collection —
 * it streams the object out of the bucket (or 302-redirects to a signed URL if
 * `signedDownloads` were configured). We re-wrap a successful stream with our
 * download headers so the byte SOURCE moves to S3 while the response shape
 * (attachment disposition, nosniff, private cache) is unchanged. A missing key
 * / adapter error maps to a 404 error Response (no counter increment).
 *
 * The S3 adapter package is NEVER imported here (so tests need no real bucket) —
 * we invoke the already-registered handler by reference.
 */
async function serveAttachmentFromS3(args: {
  payload: Payload
  req?: PayloadRequest
  filename: string
  mimeType?: string
}): Promise<Response> {
  const { payload, req, filename, mimeType } = args

  const upload = payload.collections?.['attachments']?.config?.upload as
    { handlers?: unknown[] } | undefined
  const handlers = Array.isArray(upload?.handlers) ? upload.handlers : []
  const staticHandler = handlers[handlers.length - 1] as AttachmentStaticHandler | undefined

  if (typeof staticHandler !== 'function') {
    payload.logger?.error?.(
      '[fileDownload] STORAGE_DRIVER=s3 but no storage static handler is registered on the attachments collection.',
    )
    return json(500, 'File storage is misconfigured.')
  }

  // The S3 getFile reads `req.payload`/`req.headers`; supply a minimal request
  // when none is available (Local-API callers / tests).
  const handlerReq = req ?? ({ payload, headers: new Headers() } as unknown as PayloadRequest)

  let upstream: Response
  try {
    upstream = await staticHandler(handlerReq, {
      headers: new Headers(),
      params: { collection: 'attachments', filename },
    })
  } catch (err) {
    payload.logger?.error?.({ err }, `[fileDownload] S3 fetch threw for ${filename}.`)
    return json(404, 'File not found.')
  }

  if (!upstream || upstream.status >= 400) {
    payload.logger?.error?.(
      `[fileDownload] S3 fetch failed for ${filename} (status ${upstream?.status ?? 'none'}).`,
    )
    return json(404, 'File not found.')
  }

  // Success (200/206 stream, 304, or a 302 signed-URL redirect). Preserve the
  // upstream body + status and add our download headers.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: withDownloadHeaders(new Headers(upstream.headers), filename, mimeType),
  })
}

/**
 * Atomically increments ONE attachment's per-file `downloadCount` (Task 5B D5
 * fix). Runs ONLY after a TRULY-served 200 full-body response (see the call
 * site — 304/206/302 never reach here).
 *
 * ## Why a scoped atomic SQL update, not the old whole-array rewrite
 *
 * The previous implementation read the WHOLE `posts.attachments` array, bumped
 * one row's counter in memory, then wrote the ENTIRE array back via
 * `payload.update`. That read-modify-write was doubly unsafe:
 *   1. **Edit-clobber** — an admin saving the post (or editing a sibling
 *      attachment's description/representative flag) between our READ and our
 *      WRITE was silently overwritten: the download re-persisted its STALE copy
 *      of the whole array, reverting the admin's change (last-writer-wins over
 *      the whole array).
 *   2. **Lost updates** — two concurrent downloads both read count=N and both
 *      wrote N+1, so the counter advanced by one instead of two.
 *
 * The fix is a SCOPED, single-column UPDATE against exactly the one array row
 * (`_parent_id` = the post, `file_sn` = the requested file). Payload stores an
 * `array` field as its own table (`posts_attachments`), so this touches ONLY
 * that row's `download_count` column — never the whole array, never a sibling
 * row, never any other column — so a concurrent admin edit can no longer be
 * clobbered by a download. `SET download_count = download_count + 1` is atomic
 * at the row level, so concurrent increments never lose an update. The write is
 * intentionally outside the request transaction (a best-effort side effect):
 * a counter failure must never deny a legitimate download, so it is swallowed
 * (logged).
 */
async function incrementDownloadCount(args: {
  payload: Payload
  postId: string | number
  fileSn: number
}): Promise<void> {
  const { payload, postId, fileSn } = args
  try {
    await payload.db.drizzle.execute(sql`
      UPDATE "posts_attachments"
      SET "download_count" = COALESCE("download_count", 0) + 1
      WHERE "_parent_id" = ${Number(postId)} AND "file_sn" = ${fileSn}
    `)
  } catch (err) {
    payload.logger?.error?.({ err }, '[fileDownload] downloadCount increment failed')
  }
}

/**
 * The testable core: resolves access, increments the counter, and returns the
 * file (or an error Response). Pure of any HTTP framework so integration tests
 * can call it directly with a Local-API `payload` + a `user` fixture.
 */
export async function handleFileDownload(args: {
  payload: Payload
  user: unknown
  postId: string | null | undefined
  fileSn: string | number | null | undefined
  req?: PayloadRequest
}): Promise<Response> {
  const { payload, user, req } = args

  const postId = args.postId
  if (postId === null || postId === undefined || postId === '') {
    return json(400, 'A post id is required.')
  }
  const fileSn =
    typeof args.fileSn === 'number' ? args.fileSn : Number.parseInt(String(args.fileSn), 10)
  if (!Number.isInteger(fileSn)) {
    return json(400, 'A valid fileSn is required.')
  }

  // Existence-then-access via the shared guard (D1/D2/D3): missing, forbidden,
  // secret, cross-tenant, and anonymous ALL collapse to the SAME 404 so a caller
  // cannot use the status code as an existence oracle for post ids. The bespoke
  // visibility rule `canDownloadPost` is the access predicate here.
  const post = await findAccessibleDoc<Post>({
    payload,
    collection: 'posts',
    id: postId,
    user,
    req,
    access: (candidate) => canDownloadPost({ payload, user, post: candidate }),
  })
  if (!post) {
    return notFoundResponse()
  }

  const attachments = Array.isArray(post.attachments) ? post.attachments : []
  const index = attachments.findIndex((a) => a?.fileSn === fileSn)
  const attachment = index === -1 ? undefined : attachments[index]
  if (!attachment) {
    return notFoundResponse()
  }

  const mediaId = toRelationId(attachment.media)
  if (mediaId === undefined) {
    return notFoundResponse()
  }
  // Attachments live in the tenant-scoped `attachments` collection (Task
  // 4-zero), NOT the public `media` pool. `overrideAccess:true` here is safe:
  // the visibility decision was already made by `canDownloadPost` above (the
  // ONE sanctioned, secret/tenant-aware fetch path); this fetch only resolves
  // bytes for an already-authorized request.
  const media = (await payload.findByID({
    collection: 'attachments',
    id: mediaId,
    depth: 0,
    overrideAccess: true,
    req,
    disableErrors: true,
  })) as {
    filename?: string
    mimeType?: string
    filesize?: number
    tenant?: unknown
  } | null
  if (!media || typeof media.filename !== 'string' || media.filename.length === 0) {
    return notFoundResponse()
  }

  // Coherence: the attachment must belong to the SAME tenant (site) as its post.
  // `canDownloadPost` gates on the POST's tenant, and attachments are normally
  // uploaded into the post's tenant (the admin picker is tenant-filtered), so a
  // mismatch can only arise from an overrideAccess/system write linking a
  // cross-tenant attachment — never let that slip a foreign tenant's bytes past
  // the post-level gate. Denies fail-closed; consistent data never trips it.
  const postTenant = toRelationId(post.tenant)
  const attachmentTenant = toRelationId(media.tenant)
  if (
    postTenant !== undefined &&
    attachmentTenant !== undefined &&
    String(postTenant) !== String(attachmentTenant)
  ) {
    return notFoundResponse()
  }

  // Byte SOURCE by storage driver — the ONLY thing that differs between local
  // and S3. The access decision (canDownloadPost) + tenant coherence above are
  // the security gate and are IDENTICAL for both drivers (Task TR2 Part 2).
  const mimeType = typeof media.mimeType === 'string' ? media.mimeType : 'application/octet-stream'
  const byteResponse =
    getStorageDriver() === 's3'
      ? await serveAttachmentFromS3({ payload, req, filename: media.filename, mimeType })
      : await serveAttachmentFromLocalDisk({ payload, filename: media.filename, mimeType, mediaId })

  // A 4xx from the byte source means the file could not be served (missing on
  // disk / missing key). Return it as-is and do NOT increment (mirrors the
  // pre-TR2 local behavior where a failed read returned 404 before increment).
  if (byteResponse.status >= 400) {
    return byteResponse
  }

  // D5 status gate: count ONLY a truly-served full download (200). A 304 Not
  // Modified (conditional request), a 206 Partial Content (range request), or a
  // 302 signed-URL redirect (S3) delivered NO fresh full body to the user and
  // must NOT bump the counter — otherwise a browser re-validating its cache, a
  // resumable/range fetch, or a redirect would inflate the count.
  if (byteResponse.status === 200) {
    await incrementDownloadCount({ payload, postId: post.id, fileSn })
  }

  return byteResponse
}

export const fileDownloadEndpoint: Endpoint = {
  path: '/files/download',
  method: 'get',
  handler: async (req) =>
    handleFileDownload({
      payload: req.payload,
      user: req.user,
      req,
      postId: req.searchParams?.get('post'),
      fileSn: req.searchParams?.get('fileSn'),
    }),
}

export const fileEndpoints: Endpoint[] = [fileDownloadEndpoint]
