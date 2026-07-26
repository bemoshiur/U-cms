import { browserFamilyFromUserAgent, osFamilyFromUserAgent } from '../content/traffic'

/**
 * Pure error-sanitization + classification helpers for the error-log module
 * (Task 5C; feature-inventory ref 1-56). Kept free of any Payload/Node runtime
 * so every scrub rule is unit-testable and identical wherever an error is
 * captured (the global `afterError` hook, and any future frontend boundary).
 *
 * ## Why the stored error is sanitized (SECURITY)
 *
 * An unhandled exception message / stack can incidentally contain secrets or
 * PII: a `password=`/`token=` from a form body echoed into an error, a JWT or
 * bearer token, an API key, a session id, an email address, a raw connection
 * string. The error log is admin-readable AND CSV-exportable, so storing the
 * raw text would persist live credentials + personal data into a long-lived,
 * exportable store. Every message + stack therefore passes through
 * {@link sanitizeErrorMessage} / {@link sanitizeStack} before storage — the scrub
 * is deliberately AGGRESSIVE (over-redaction is the safe direction: a redacted
 * token is never a leaked token). This is the error-log analogue of the traffic
 * capture's token-redaction (`src/content/traffic.ts` B2) and the same posture
 * the audit backbone takes with PII.
 */

/** Hard caps so a pathological message/stack can never bloat a row (defense in depth). */
export const MAX_MESSAGE_LEN = 2000
export const MAX_STACK_LEN = 4000
/** Keep only the top frames of a stack — enough to locate the fault, no deep internals. */
export const MAX_STACK_FRAMES = 30
/**
 * PRE-CAP: the raw message/stack is truncated to this before scrubbing (ReDoS
 * hardening). `scrubSensitive` runs inside the global `afterError` capture on
 * EVERY request error, so an attacker who inflates a thrown error's `.message`
 * (an echoed request body, an oversized query/URL, a huge JSON-parse snippet)
 * could otherwise feed a 64k+ string into the regexes and pin the single-threaded
 * event loop. The stored value is a truncated digest anyway, so capping the INPUT
 * first is free — and combined with the bounded quantifiers below it keeps scrub
 * time linear + bounded. Must be >= MAX_STACK_LEN so the digest cap still bites.
 */
export const MAX_SCRUB_INPUT = 8192

/** The token every redaction collapses a sensitive value to. */
const REDACTED = '[REDACTED]'

/**
 * The sensitive KEY terms (an alternation source). A key counts as sensitive when
 * one of these appears anywhere in the key identifier — so it catches plain
 * (`password`, `token`), env-style SCREAMING_SNAKE (`PAYLOAD_SECRET`,
 * `DATABASE_URI`, `S3_SECRET_ACCESS_KEY`, `SMTP_PASS`), and compound
 * camelCase/snake_case (`resetToken`, `access_token`, `refreshToken`, `apiKey`)
 * keys that a naive `\bword\b` anchor would miss (there is no word boundary
 * inside `resetToken` / `PAYLOAD_SECRET`).
 */
const SENSITIVE_TERM =
  'password|passwd|pwd|passphrase|secret|token|api[_-]?key|apikey|access[_-]?key|accesskey|secret[_-]?key|secretkey|authorization|session|cookie|credential|refresh|private[_-]?key|privatekey|database[_-]?uri|database[_-]?url|connection[_-]?string|dsn|smtp[_-]?pass'

/**
 * A sensitive KEY identifier: an optional bounded prefix + a {@link SENSITIVE_TERM}
 * + an optional bounded suffix. The `{0,16}` bounds are LOAD-BEARING for ReDoS
 * safety — unbounded `[...]*` on BOTH sides of the alternation is the catastrophic
 * backtracking pattern; bounding each side to a small constant keeps the
 * failed-match cost O(16²) per position, i.e. linear in input length. The prefix
 * can be empty, so the term still matches even when it starts the key (a
 * non-sensitive `Error: ` / `detail: ` prefix can't swallow an inner `token=…`);
 * a key with a >16-char prefix (`SURVEY_PARTICIPANT_SECRET`) still redacts its
 * VALUE — only the echoed key LABEL may be partial, which is cosmetic.
 */
const SENSITIVE_KEY = `[A-Za-z0-9_.-]{0,16}(?:${SENSITIVE_TERM})[A-Za-z0-9_.-]{0,16}`

/**
 * `KEY[:=]value` (bare form). The separator also accepts URL-ENCODED `=`/`:`
 * (`%3D`/`%3A`) so a `resetToken%3Ddeadbeef` in an encoded query string is still
 * caught. The value is a BOUNDED negated class (`{1,512}`) — a single bounded
 * quantifier (never nested), so no ReDoS; an over-long value's tail is caught by
 * the opaque-blob pass as a backstop.
 */
const SENSITIVE_KV = new RegExp(
  `(${SENSITIVE_KEY})(\\s*(?:[:=]|%3[aAdD])\\s*)("?)([^\\s"'&,;)}\\]]{1,512})`,
  'gi',
)

/** JSON-shaped `"key":"value"` where the key is sensitive (`{"password":"…"}`). */
const SENSITIVE_JSON = new RegExp(`"(${SENSITIVE_KEY})"\\s*:\\s*"[^"]{0,512}"`, 'gi')

/** URL / connection-string userinfo: redact the WHOLE userinfo up to the LAST `@`. */
const URI_USERINFO = /\b([a-z][a-z0-9+.-]{0,20}):\/\/[^\s/]{1,256}@/gi

/**
 * Scrubs a single string of the known-sensitive patterns, in a deliberate order
 * (most specific first). Shared by the message + every stack line. Every regex
 * uses only single or bounded quantifiers (no nested unbounded `[...]*` around an
 * alternation), and callers pre-cap the input length, so scrub time is linear +
 * bounded (ReDoS-safe).
 *
 *  1. URL / connection-string USERINFO credentials → `<scheme>://[REDACTED]@host`
 *     (redacts the whole userinfo up to the LAST `@`, so a password containing
 *     `@` — `postgres://user:p@ss@host` — is fully removed).
 *  2. `Bearer <token>` authorization values.
 *  3. JSON-shaped `"key":"value"` for a sensitive key.
 *  4. sensitive `KEY=value` / `KEY: value` / `KEY%3Dvalue` (env secrets, compound
 *     token params, URL-encoded separators).
 *  5. JWT-shaped tokens (`eyJ…​.…​.…`).
 *  6. Email addresses (PII).
 *  7. Opaque token/secret blobs — hex runs (20+) and long base64 (40+).
 *
 * Over-redaction is intentional and safe: this store is admin-readable +
 * exportable, so a false positive (a redacted non-secret) is always preferable
 * to a false negative (a leaked secret).
 */
export function scrubSensitive(input: string): string {
  let out = input

  // 1. URL / connection-string userinfo. `[^\s/]{1,256}@` (greedy, single bounded
  //    quantifier) consumes up to the LAST `@` before the host authority, so an
  //    embedded `@` in the password (`user:p@ss@host`) is fully redacted, not
  //    half-leaked. Covers postgres/mysql/redis/mongodb/https/… .
  out = out.replace(URI_USERINFO, `$1://${REDACTED}@`)

  // 2. Authorization bearer tokens (bounded).
  out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/-]{1,512}=*/gi, `Bearer ${REDACTED}`)

  // 3. JSON `"key":"value"` for a sensitive key → redact the value in place.
  out = out.replace(SENSITIVE_JSON, (_m, key: string) => `"${key}":"${REDACTED}"`)

  // 4. sensitive KEY=value / KEY: value / KEY%3Dvalue — env secrets
  //    (`PAYLOAD_SECRET`, `DATABASE_URI`), compound params (`resetToken`,
  //    `access_token`, `apiKey`), incl. non-sensitive-prefixed (`Error: token=…`).
  out = out.replace(SENSITIVE_KV, (_m, key: string) => `${key}=${REDACTED}`)

  // 5. JWT-shaped tokens (three base64url segments; the leading `eyJ` is a JSON
  //    header `{"` in base64url — a strong, low-false-positive signal).
  out = out.replace(
    /\beyJ[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}/g,
    REDACTED,
  )

  // 6. Email addresses (PII — never stored in the error log).
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, REDACTED)

  // 7. Opaque token/secret blobs — hex runs (20+: the ~20-hex reset-token shape,
  //    session/CSRF tokens, hashes, keys) and long base64 (40+).
  out = out.replace(/\b[A-Fa-f0-9]{20,}\b/g, REDACTED)
  out = out.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, REDACTED)

  return out
}

/**
 * Sanitizes an error message for storage: scrubs sensitive patterns
 * ({@link scrubSensitive}), collapses whitespace, and caps the length. A
 * non-string / empty message degrades to `'(no message)'`.
 */
export function sanitizeErrorMessage(message: unknown): string {
  if (typeof message !== 'string' || message.trim() === '') {
    return '(no message)'
  }
  // PRE-CAP the raw input BEFORE scrubbing (ReDoS hardening — see MAX_SCRUB_INPUT).
  const capped = message.length > MAX_SCRUB_INPUT ? message.slice(0, MAX_SCRUB_INPUT) : message
  const scrubbed = scrubSensitive(capped).replace(/\s+/g, ' ').trim()
  return scrubbed.length > MAX_MESSAGE_LEN ? `${scrubbed.slice(0, MAX_MESSAGE_LEN)}…` : scrubbed
}

/**
 * Builds the `stackDigest` from an error stack: a TRUNCATED + SCRUBBED stack —
 * the top {@link MAX_STACK_FRAMES} lines, each run through {@link scrubSensitive},
 * capped at {@link MAX_STACK_LEN}. Deliberately NOT the full stack: enough to
 * locate the fault, never the deep internals or any secret a frame's arguments
 * might have carried. Returns `undefined` when no stack is available (so the
 * field is simply absent, not an empty string).
 */
export function sanitizeStack(stack: unknown): string | undefined {
  if (typeof stack !== 'string' || stack.trim() === '') {
    return undefined
  }
  // PRE-CAP the raw stack BEFORE splitting/scrubbing (ReDoS hardening) — the whole
  // stack (not just per-line) is bounded, so total scrub work is bounded.
  const capped = stack.length > MAX_SCRUB_INPUT ? stack.slice(0, MAX_SCRUB_INPUT) : stack
  const lines = capped.split('\n').slice(0, MAX_STACK_FRAMES).map(scrubSensitive)
  const digest = lines.join('\n').trim()
  if (digest === '') {
    return undefined
  }
  return digest.length > MAX_STACK_LEN ? `${digest.slice(0, MAX_STACK_LEN)}…` : digest
}

/**
 * The exception CLASS name for the by-type stat tab (ref 1-58). Prefers the
 * error's constructor name (`TypeError`, `APIError`, …), falling back to its
 * `name` property, then a generic label. Capped + stripped of anything but a
 * sane identifier set so a crafted `name` can't inject markup/CSV formulas.
 */
export function resolveExceptionClass(err: unknown): string {
  let raw: string | undefined
  if (err instanceof Error) {
    raw = err.constructor?.name || err.name
  } else if (err && typeof err === 'object') {
    const name = (err as { name?: unknown }).name
    raw = typeof name === 'string' ? name : undefined
  } else if (typeof err === 'string') {
    raw = 'StringError'
  }
  const cleaned = (raw ?? 'UnknownError').replace(/[^A-Za-z0-9_$.]/g, '').slice(0, 100)
  return cleaned || 'UnknownError'
}

/**
 * A COARSE user-agent family label (`os/browser`, e.g. `windows/chrome`) for
 * the error row — same privacy line as the traffic OS/browser tabs: a family
 * only, NEVER a version, so it aggregates but does not fingerprint. Returns
 * `undefined` for an absent UA (field simply omitted).
 */
export function userAgentFamilyFromUserAgent(
  userAgent: string | null | undefined,
): string | undefined {
  if (typeof userAgent !== 'string' || userAgent.trim() === '') {
    return undefined
  }
  return `${osFamilyFromUserAgent(userAgent)}/${browserFamilyFromUserAgent(userAgent)}`
}
