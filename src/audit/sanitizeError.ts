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
 * Matches a `KEY[:=]value` whose KEY *contains* a {@link SENSITIVE_TERM}, with
 * the surrounding key identifier chars captured so the key name is preserved and
 * only the value is redacted. Anchoring on the sensitive term (not on "any
 * identifier") is deliberate: it means a NON-sensitive prefix like `Error: ` or
 * `detail: ` can't swallow an inner `token=…` — the engine slides past the
 * non-sensitive key straight to the sensitive one.
 */
const SENSITIVE_KV = new RegExp(
  `([A-Za-z0-9_.-]*(?:${SENSITIVE_TERM})[A-Za-z0-9_.-]*)(\\s*[:=]\\s*)("?)([^\\s"'&,;)}\\]]+)`,
  'gi',
)

/**
 * Scrubs a single string of the known-sensitive patterns, in a deliberate order
 * (most specific first). Shared by the message + every stack line.
 *
 *  1. URL / connection-string USERINFO credentials → `<scheme>://[REDACTED]@host`
 *     (`postgres://user:pw@host`, `mysql://root:toor@host`, the DATABASE_URI shape).
 *  2. `Bearer <token>` authorization values.
 *  3. sensitive `KEY=value` / `KEY: value` — KEY matched by {@link SENSITIVE_KEY}
 *     as a substring, so env secrets + compound token params are covered.
 *  4. JWT-shaped tokens (`eyJ…​.…​.…`).
 *  5. Email addresses (PII).
 *  6. Opaque token/secret blobs — hex runs (20+, incl. the reset-token shape) and
 *     long base64 (40+).
 *
 * Over-redaction is intentional and safe: this store is admin-readable +
 * exportable, so a false positive (a redacted non-secret) is always preferable
 * to a false negative (a leaked secret).
 */
export function scrubSensitive(input: string): string {
  let out = input

  // 1. URL / connection-string userinfo credentials (before anything else, so the
  //    whole `user:pass@` is gone regardless of scheme). `[^\s/@]+@` is the
  //    userinfo up to the `@` — covers postgres/mysql/redis/mongodb/https/… .
  out = out.replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@]+@/gi, `$1://${REDACTED}@`)

  // 2. Authorization bearer tokens.
  out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`)

  // 3. sensitive KEY=value / KEY: value — KEY contains a SENSITIVE_TERM, so
  //    `PAYLOAD_SECRET`, `DATABASE_URI`, `resetToken`, `access_token`, `apiKey`,
  //    `password`, … are all caught (incl. when preceded by a non-sensitive
  //    `Error: ` / `detail: ` prefix), while ordinary `id=5` / `line:12` are left.
  out = out.replace(SENSITIVE_KV, (_m, key: string) => `${key}=${REDACTED}`)

  // 4. JWT-shaped tokens (three base64url segments; the leading `eyJ` is a JSON
  //    header `{"` in base64url — a strong, low-false-positive signal).
  out = out.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED)

  // 5. Email addresses (PII — never stored in the error log).
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, REDACTED)

  // 6. Opaque token/secret blobs — hex runs (20+: the ~20-hex reset-token shape,
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
  const scrubbed = scrubSensitive(message).replace(/\s+/g, ' ').trim()
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
  const lines = stack.split('\n').slice(0, MAX_STACK_FRAMES).map(scrubSensitive)
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
