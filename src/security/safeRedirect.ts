/**
 * Pure post-login redirect-target sanitizer (security-review fix, open
 * redirect). No I/O, no Payload -- kept standalone so it can be unit-tested
 * exhaustively and reused anywhere a `?redirect=` (or similar) query param is
 * turned into a same-tab navigation target.
 *
 * A naive `startsWith('/') && !startsWith('//')` check is NOT sufficient:
 * browsers normalize a backslash to a forward slash when resolving a URL, so
 * a value starting with slash-backslash (or slash-backslash-slash) becomes
 * the protocol-relative `//evil.com` at fetch/navigate time and escapes the
 * app's origin even though the raw string only has one leading `/`. This
 * function rejects those forms explicitly, then -- belt-and-suspenders --
 * resolves the candidate against a fixed placeholder origin and confirms the
 * resolved origin didn't change, which catches any other
 * authority-introducing sequence (absolute URLs, backslash-backslash hosts,
 * etc.) without having to enumerate every browser URL-parsing quirk by hand.
 */

/** Placeholder origin used purely to detect whether resolving `value` escapes it. */
const PLACEHOLDER_ORIGIN = 'https://safe-redirect.invalid'

/**
 * True if `value` contains a C0 control character (code point 0-31) or DEL
 * (code point 127) anywhere. Checked via char codes rather than a regex to
 * avoid any ambiguity around unicode-escape handling.
 */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

/**
 * Returns `value` unchanged if it is a safe, same-origin relative path;
 * otherwise returns `fallback`.
 */
export function safeRedirect(raw: string | string[] | undefined, fallback: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw

  if (typeof value !== 'string' || value.length === 0) {
    return fallback
  }

  // Reject control characters (including a leading one) anywhere in the
  // value. The WHATWG URL parser silently strips tabs/newlines rather than
  // rejecting them, so this must be checked independently of the
  // origin-resolution step below.
  if (hasControlChar(value)) {
    return fallback
  }

  // Must be a single leading '/' followed by a normal path character -- not
  // another '/' (protocol-relative) or a backslash (browser-normalized to
  // another '/', i.e. also protocol-relative).
  const firstChar = value.charAt(0)
  const secondChar = value.charAt(1)
  if (firstChar !== '/' || secondChar === '/' || secondChar === String.fromCharCode(92)) {
    return fallback
  }

  try {
    const resolved = new URL(value, PLACEHOLDER_ORIGIN)
    if (resolved.origin !== PLACEHOLDER_ORIGIN) {
      return fallback
    }
  } catch {
    return fallback
  }

  return value
}
