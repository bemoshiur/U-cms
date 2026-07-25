import { randomInt } from 'node:crypto'

import { isHttpUrl, isSafeInternalLink } from './display'

/**
 * Pure short-URL helpers (Task 3D Part 3; refs 1-42/1-43). No Payload runtime
 * dependency, so code generation + redirect-target validation are unit-tested
 * in isolation. The `shortUrls` collection generates a `code` on create; the
 * public `GET /s/:code` redirect re-validates the target before issuing a 302.
 */

/** The fixed short-code length (legacy short codes are 8 alphanumeric chars). */
export const SHORT_CODE_LENGTH = 8

/** Alphabet for generated codes — case-sensitive alphanumerics (62 symbols). */
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Matches a well-formed short code (used to reject junk `/s/:code` paths early). */
export const SHORT_CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/

/**
 * Generates a random alphanumeric short code. Uses `crypto.randomInt` for an
 * unbiased pick from the 62-symbol alphabet (rather than `Math.random`, which
 * is neither uniform nor unpredictable). The DB carries a `unique` index on
 * `code` as the collision backstop; the collection hook regenerates on the rare
 * clash (same posture as the sequential-ID generators, but random rather than
 * max+1 since these codes are deliberately opaque, not ordered).
 */
export function generateShortCode(length = SHORT_CODE_LENGTH): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length))
  }
  return out
}

/**
 * Whether a stored short-URL target is safe to 302-redirect to. A short URL's
 * target is INTENTIONALLY an external destination (the whole point of a short
 * link), so an absolute http(s) URL is allowed — this is NOT a classic
 * open-redirect (the admin deliberately created the mapping). The real risk is
 * a dangerous SCHEME (`javascript:`, `data:`, `vbscript:`…) or a malformed
 * pseudo-path, so the target must be EITHER an absolute http(s) URL OR a
 * genuine site-relative internal link (`/path` or `?query`). Everything else is
 * rejected. Re-checked on every redirect (defense in depth) even though the
 * field validator already enforced it on save — the DB value could have been
 * tampered with, or the validation rules could have changed since.
 */
export function isValidRedirectTarget(url: unknown): boolean {
  return isHttpUrl(url) || isSafeInternalLink(url)
}
