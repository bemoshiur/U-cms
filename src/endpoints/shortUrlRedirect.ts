import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { isValidRedirectTarget, SHORT_CODE_PATTERN } from '../content/shortUrl'

/**
 * Public short-URL redirect (Task 3D Part 3; refs 1-42/1-43 — replaces the
 * legacy `shortView`). Reachable at the pretty public path `GET /s/:code`
 * (the Next.js route handler at `src/app/(frontend)/s/[code]/route.ts`) AND at
 * `GET /api/s/:code` (the Payload config endpoint below) — both delegate to the
 * one testable core `handleShortUrlRedirect`.
 *
 * ## Public reachability + the IP guard
 *
 * The redirect must work for anonymous visitors regardless of the admin IP
 * allowlist. Two independent facts make it reachable:
 *  - `/s/:code` is NOT under `/admin` or `/api`, so the proxy `matcher`
 *    (`src/proxy.ts`) never runs for it, and `classifyAdminPath` classifies it
 *    `exempt` anyway — it is public by construction.
 *  - `/api/s/:code` IS under `/api`, so `/api/s` is added to
 *    `EXEMPT_API_PREFIXES` (`src/security/adminIpEnforcement.ts`) — exactly like
 *    the public account-request endpoints.
 *
 * ## Not an open redirect
 *
 * A short URL's target is INTENTIONALLY an external destination (that is the
 * whole feature). The threat is a DANGEROUS target (`javascript:`, `data:`,
 * protocol-relative `//evil`, …), so the stored `originalUrl` is RE-validated
 * on every redirect via `isValidRedirectTarget` (absolute http(s) or a genuine
 * site-relative path only) — defense in depth on top of the create-time field
 * validator. An unknown code (or a target that no longer validates) is a plain
 * 404; nothing is leaked.
 */

/** Minimal not-found HTML for a browser hitting an unknown/invalid short code. */
function notFound(): Response {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Link not found</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 24px"><h1 style="font-size:1.3rem">Link not found</h1><p style="color:#52525b">This short link does not exist or is no longer valid.</p></body></html>',
    {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    },
  )
}

/**
 * Testable core: resolves a code to its target, re-validates it, best-effort
 * bumps the hit counter, and returns a 302 (or a 404). Pure of any HTTP
 * framework so integration tests call it directly with a Local-API `payload`.
 */
export async function handleShortUrlRedirect(args: {
  payload: Payload
  code: string | null | undefined
  req?: PayloadRequest
}): Promise<Response> {
  const { payload, req } = args
  const code = typeof args.code === 'string' ? args.code : ''

  // Reject obviously-malformed codes before touching the DB.
  if (!SHORT_CODE_PATTERN.test(code)) {
    return notFound()
  }

  // Public lookup (overrideAccess) — anyone may follow a short link.
  const found = await payload.find({
    collection: 'shortUrls',
    where: { code: { equals: code } },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const doc = found.docs[0] as
    { id: string | number; originalUrl?: unknown; hitCount?: unknown } | undefined
  if (!doc) {
    return notFound()
  }

  const target = doc.originalUrl
  // Re-validate the stored target — never 302 to a dangerous/tampered value.
  if (typeof target !== 'string' || !isValidRedirectTarget(target)) {
    return notFound()
  }

  // Best-effort hit counter — a write failure must never break the redirect.
  try {
    await payload.update({
      collection: 'shortUrls',
      id: doc.id,
      data: { hitCount: (typeof doc.hitCount === 'number' ? doc.hitCount : 0) + 1 },
      overrideAccess: true,
      req,
      context: { skipAudit: true },
    })
  } catch (err) {
    payload.logger?.error?.({ err }, '[shortUrl] hitCount increment failed')
  }

  return new Response(null, {
    status: 302,
    headers: { Location: target, 'Cache-Control': 'no-store' },
  })
}

/** Payload config endpoint: `GET /api/s/:code`. */
export const shortUrlRedirectEndpoint: Endpoint = {
  path: '/s/:code',
  method: 'get',
  handler: async (req) =>
    handleShortUrlRedirect({
      payload: req.payload,
      req,
      code: req.routeParams?.code as string | undefined,
    }),
}
