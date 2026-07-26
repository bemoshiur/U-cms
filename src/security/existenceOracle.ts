import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

/**
 * Shared existence-then-access guard (Task 4C — closes Phase-3 D1/D2/D3).
 *
 * ## The existence oracle, and the chosen posture
 *
 * When a protected resource is fetched by id, returning DIFFERENT statuses for
 * "does not exist" (404) versus "exists but you may not see it" (403) leaks the
 * existence of ids across the tenant boundary — a caller can enumerate which
 * post / board / web-content ids are real (or belong to another site / are
 * secret) purely from the status code. Before Task 4C the three managed
 * endpoints diverged: `fileDownload` returned 404-missing vs 403-forbidden,
 * `webContentDiff` 404 / 403 / 400-wrong-version, `boardExport` 403 for both.
 *
 * Task 4C collapses that to ONE posture, applied everywhere a resource is
 * resolved by id: **missing, cross-tenant, forbidden, secret, and anonymous all
 * return the SAME 404** (prefer 404 — never confirm existence to someone not
 * allowed to see it). Genuine request-shape errors (a missing/blank id or query
 * param) stay 400 — they describe the REQUEST, not a specific resource, so they
 * leak nothing. The public RSC routes (`/page`, `/board`, `/board/[id]`) already
 * embody the same posture: their resolvers return `null` for
 * missing/cross-site/hidden-menu/secret and the route calls Next's `notFound()`
 * (→ 404). This module is the single shared implementation the three endpoints
 * use so the posture can never drift between them again.
 */

/** The canonical anti-enumeration message — identical for missing AND forbidden. */
export const NOT_FOUND_MESSAGE = 'Not found.'

/** The ONE 404 Response every managed endpoint returns for missing/forbidden/secret/anon. */
export function notFoundResponse(): Response {
  return Response.json({ ok: false, message: NOT_FOUND_MESSAGE }, { status: 404 })
}

/**
 * Resolves a collection document by id, returning it ONLY when it both EXISTS
 * and the caller may access it — otherwise `null` (which the caller maps to the
 * single {@link notFoundResponse}). This is the existence-then-access two-step:
 *
 *  1. EXISTENCE via `overrideAccess: true` (so a genuine 404 is not confused
 *     with a permission denial at this layer).
 *  2. ACCESS — either a custom `access` predicate (used by `fileDownload`, whose
 *     visibility rule is the bespoke `canDownloadPost`, not the collection's own
 *     read access), or, when no predicate is given, a re-find under the caller's
 *     `user` with `overrideAccess: false` so the collection's tenant-scoped read
 *     access decides (used by `webContentDiff` / `boardExport`).
 *
 * Both failure modes (does-not-exist, and exists-but-denied) return `null`, so
 * the caller cannot tell them apart — that is the whole point. The returned doc
 * is the OVERRIDE-fetched one (fully populated for the caller's subsequent use;
 * access was already decided).
 */
export async function findAccessibleDoc<T = Record<string, unknown>>(args: {
  payload: Payload
  collection: CollectionSlug
  id: string | number
  user: unknown
  req?: PayloadRequest
  /** Custom visibility predicate; when omitted, the collection's read access decides. */
  access?: (doc: T) => boolean | Promise<boolean>
}): Promise<T | null> {
  const { payload, collection, id, user, req, access } = args

  const existing = (await payload.findByID({
    collection,
    id,
    depth: 0,
    overrideAccess: true,
    req,
    disableErrors: true,
  })) as T | null
  if (!existing) {
    return null
  }

  if (access) {
    return (await access(existing)) ? existing : null
  }

  // No custom predicate → the collection's own (tenant-scoped) read access
  // decides. A missing grant throws Forbidden; a wrong-tenant doc filters to
  // null. Either way the caller is not allowed to see it → null (→ 404).
  try {
    const readable = await payload.findByID({
      collection,
      id,
      depth: 0,
      overrideAccess: false,
      user: user as PayloadRequest['user'],
      req,
      disableErrors: true,
    })
    return readable ? existing : null
  } catch {
    return null
  }
}
