import fsPromises from 'fs/promises'
import path from 'path'
import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess, isSuperUser } from '../access/hasMenuAccess'
import { getAssignedTenantIds } from '../access/tenantAccess'
import { toRelationId } from '../collections/utils'
import { POSTS_MENU_KEY } from '../collections/posts/defaults'
import type { Post } from '../payload-types'

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
 * ## S3 storage (documented limitation)
 *
 * Byte-serving reads from the local upload dir (the dev/default driver). With
 * `STORAGE_DRIVER=s3` the file is not on local disk; wiring this endpoint to
 * the S3 adapter's fetch is a follow-up. The access + counter logic is
 * storage-agnostic; only the final read differs.
 */

type PostLike = {
  id: string | number
  tenant?: unknown
  authorUser?: unknown
  attachments?: unknown
  isSecret?: unknown
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
 *    post's attachment. SECRET posts require the admin/author branch, so a member
 *    (even a member who authored a secret post — a documented T4C refinement) is
 *    denied a secret file. ANONYMOUS (no session) is DENIED for everything —
 *    preserving Task 4-zero's "nothing fetchable unauthenticated" invariant. The
 *    policy is therefore MEMBERS-ONLY (not fully public); see task-4B-report.md.
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

  // Authenticated public-site MEMBER (or any non-admin authed principal):
  // non-secret posts only. Secret posts require the admin/author branch above.
  return post.isSecret !== true
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

  // Existence first (overrideAccess) so we can distinguish 404 (missing) from
  // 403 (exists but forbidden) precisely.
  const post = (await payload.findByID({
    collection: 'posts',
    id: postId,
    depth: 0,
    overrideAccess: true,
    req,
    disableErrors: true,
  })) as Post | null
  if (!post) {
    return json(404, 'File not found.')
  }

  if (!(await canDownloadPost({ payload, user, post }))) {
    return json(403, 'You are not allowed to download this file.')
  }

  const attachments = Array.isArray(post.attachments) ? post.attachments : []
  const index = attachments.findIndex((a) => a?.fileSn === fileSn)
  const attachment = index === -1 ? undefined : attachments[index]
  if (!attachment) {
    return json(404, 'File not found.')
  }

  const mediaId = toRelationId(attachment.media)
  if (mediaId === undefined) {
    return json(404, 'File not found.')
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
  })) as { filename?: string; mimeType?: string; filesize?: number } | null
  if (!media || typeof media.filename !== 'string' || media.filename.length === 0) {
    return json(404, 'File not found.')
  }

  // Resolve the byte path with a strict traversal guard (mirrors Payload's own
  // getFileHandler): the resolved path must stay inside the upload dir.
  const dir = resolveStaticDir(payload, 'attachments')
  const filePath = path.resolve(dir, media.filename)
  if (
    filePath !== path.join(dir, path.basename(media.filename)) ||
    !filePath.startsWith(dir + path.sep)
  ) {
    return json(400, 'Invalid file reference.')
  }

  let bytes: Buffer
  try {
    bytes = await fsPromises.readFile(filePath)
  } catch {
    payload.logger?.error?.(
      `[fileDownload] missing file on disk for media ${mediaId} (${media.filename}).`,
    )
    return json(404, 'File not found.')
  }

  // Increment the per-file counter. `skipPostSideEffects` makes the posts
  // beforeValidate hook a no-op; `skipAudit` avoids a log row per download
  // (downloads are read-like — read auditing is deferred, see auditCollection).
  const updatedAttachments = attachments.map((a, i) =>
    i === index
      ? { ...a, downloadCount: (typeof a.downloadCount === 'number' ? a.downloadCount : 0) + 1 }
      : { ...a },
  ) as NonNullable<Post['attachments']>
  try {
    await payload.update({
      collection: 'posts',
      id: postId,
      data: { attachments: updatedAttachments },
      overrideAccess: true,
      req,
      context: { skipPostSideEffects: true, skipAudit: true },
    })
  } catch (err) {
    // A counter-write failure must not deny a legitimate download.
    payload.logger?.error?.({ err }, '[fileDownload] downloadCount increment failed')
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type':
        typeof media.mimeType === 'string' ? media.mimeType : 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': contentDisposition(media.filename),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
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
