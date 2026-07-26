/**
 * Single source of truth for the absolute public origin the app uses to build
 * every security-sensitive absolute link it generates itself (password-reset,
 * member-verify, etc.). `payload.config`'s authoritative `serverURL` AND the
 * email link-builders (`src/email/authEmails.ts`, `src/email/memberEmails.ts`)
 * all resolve through here so they can never diverge.
 *
 * SECURITY (CWE-640 host/reset-link poisoning — see
 * `.superpowers/sdd/TODO/phase1-final-review.md` I-1): every source below is
 * SERVER-controlled. This intentionally NEVER consults the request `Origin`
 * header, so an unauthenticated caller of `POST /api/find-password` can never
 * choose the host embedded in a reset link mailed to a victim.
 *
 * Resolution order:
 *   1. `PAYLOAD_PUBLIC_SERVER_URL` — the explicit, STABLE production origin
 *      (preferred; set this to your custom/production domain).
 *   2. `SERVER_URL` — accepted alias.
 *   3. `VERCEL_URL` — Vercel injects the deployment's own host (no protocol);
 *      we prepend `https://`. This is Vercel-controlled (NOT client-controllable),
 *      so it is a safe fallback that lets a demo boot with correct links even
 *      when (1)/(2) are unset. Prefer (1) for real production because
 *      `VERCEL_URL` changes on every deployment (per-deploy preview hostnames).
 *   4. `http://localhost:3000` — local development only.
 */
export function resolvePublicServerURL(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = firstNonEmpty(env.PAYLOAD_PUBLIC_SERVER_URL, env.SERVER_URL)
  if (explicit) {
    return stripTrailingSlash(explicit)
  }

  const vercel = firstNonEmpty(env.VERCEL_URL)
  if (vercel) {
    const withProtocol = /^https?:\/\//i.test(vercel) ? vercel : `https://${vercel}`
    return stripTrailingSlash(withProtocol)
  }

  return 'http://localhost:3000'
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '')
}
