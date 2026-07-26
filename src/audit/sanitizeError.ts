import { browserFamilyFromUserAgent, osFamilyFromUserAgent } from '../content/traffic'

/**
 * Error-sanitization + classification helpers for the error-log module (Task 5C;
 * feature-inventory ref 1-56). No Payload dependency (unit-testable, identical
 * wherever an error is captured). The one runtime input it reads is `process.env`
 * — the PRIMARY defense string-replaces the app's OWN secret values (see
 * {@link collectEnvSecretValues}); it is parameterized so tests inject their own.
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
 * Pathological-size guard: the raw message/stack is cut to this (a plain O(1)
 * substring) BEFORE scrubbing, so an inflated `.message` can't be scanned in full.
 * It is deliberately GENEROUS — 64 KB, 8× the old 8 KB — for two reasons: (1) a
 * realistic secret / connection string (< 1 KB, and its credential sits at the
 * URI's START) never STRADDLES the cut and loses its delimiter, which an 8 KB
 * pre-cap did (a URI whose `@` sat past 8 KB was truncated mid-userinfo and the
 * password tail leaked); (2) it bounds the worst-case scrub of an ADVERSARIAL
 * input (a 64 KB run engineered to maximize the term-anchored regexes' bounded
 * backtracking) to well under 100 ms with comfortable CI headroom — a larger cap
 * (256 KB measured ~230 ms) would not. A bigger input is O(1)-cut to 64 KB first,
 * so it too completes fast. Scrub runs on the whole (≤ 64 KB) input; only AFTER
 * scrubbing is the result truncated to the digest size (MAX_MESSAGE_LEN / _STACK_).
 */
export const MAX_SCRUB_INPUT = 65536

/** Env-secret values shorter than this are ignored for redaction (never nuke a short/common value). */
export const MIN_ENV_SECRET_LEN = 8

/** The token every redaction collapses a sensitive value to. */
const REDACTED = '[REDACTED]'

/**
 * The app's own env vars whose VALUES are secrets to scrub verbatim. The explicit
 * list guarantees the brief-named ones (some — `DATABASE_URI`, `S3_ACCESS_KEY_ID` —
 * don't match the name pattern); the pattern then catches ANY other
 * `*_SECRET` / `*_TOKEN` / `*_PASSWORD` / `*_KEY` env present at runtime.
 */
const ENV_SECRET_NAMES = [
  'PAYLOAD_SECRET',
  'DATABASE_URI',
  'DATABASE_URL',
  'S3_SECRET_ACCESS_KEY',
  'S3_ACCESS_KEY_ID',
  'SMTP_PASS',
  'SMTP_PASSWORD',
  'SURVEY_PARTICIPANT_SECRET',
  'TRAFFIC_SECRET',
]
const ENV_SECRET_NAME_RE =
  /SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|CREDENTIAL|PRIVATE_?KEY|_KEY$|_PASS$|_DSN$/i

/**
 * The PRIMARY, bypass-proof redaction input: the app's OWN runtime secret VALUES
 * (from `process.env`), longest-first so a longer secret can't be partially
 * shadowed by a shorter one. `scrubSensitive` string-replaces each of these
 * VERBATIM before any heuristic regex, so the real DB URI (with password), the
 * signing secret, the S3 keys, etc. are removed regardless of the format, encoding,
 * whitespace or position they appear in — plain `String.split/join`, O(n), no
 * regex, no bypass. Values shorter than {@link MIN_ENV_SECRET_LEN} are ignored so a
 * short/common env value can't cause mass over-redaction. Parameterized for tests.
 */
export function collectEnvSecretValues(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const values = new Set<string>()
  for (const name of Object.keys(env)) {
    const value = env[name]
    if (typeof value !== 'string' || value.length < MIN_ENV_SECRET_LEN) {
      continue
    }
    if (ENV_SECRET_NAMES.includes(name) || ENV_SECRET_NAME_RE.test(name)) {
      values.add(value)
    }
  }
  return [...values].sort((a, b) => b.length - a.length)
}

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
 * + an optional bounded suffix. The `{0,8}` bounds are LOAD-BEARING for ReDoS
 * safety — unbounded `[...]*` on BOTH sides of the alternation is the catastrophic
 * backtracking pattern; bounding each side to a small constant keeps the
 * failed-match cost O(8²) per position, i.e. linear in input length (and 3× cheaper
 * than `{0,16}`, which matters at the 64 KB cap). The prefix can be empty, so the
 * term still matches even when it starts the key (a non-sensitive `Error: ` /
 * `detail: ` prefix can't swallow an inner `token=…`); a key with a longer prefix
 * (`SURVEY_PARTICIPANT_SECRET`) still redacts its VALUE — the match simply starts
 * nearer the term, so only the echoed key LABEL may be partial, which is cosmetic.
 */
const SENSITIVE_KEY = `[A-Za-z0-9_.-]{0,8}(?:${SENSITIVE_TERM})[A-Za-z0-9_.-]{0,8}`

/** The KEY→value separator: `:`/`=`, incl. URL-encoded (`%3A`/`%3D`), with optional spaces. */
const SEP = `\\s*(?:[:=]|%3[aAdD])\\s*`

/** JSON-shaped `"key":"value"` where the key is sensitive (`{"password":"…"}`). */
const SENSITIVE_JSON = new RegExp(`"(${SENSITIVE_KEY})"\\s*:\\s*"[^"]{0,512}"`, 'gi')

/**
 * A sensitive key followed by a QUOTED value (single OR double quote): redact the
 * ENTIRE quoted span, so a value WITH SPACES (`password="my secret pass"`,
 * `passphrase='correct horse battery staple'`) is fully removed, not truncated at
 * the first space. The value is a tempered, BOUNDED class
 * (`(?:(?!\2)[^\r\n]){0,512}`) — a single bounded quantifier, so no ReDoS.
 */
const SENSITIVE_KV_QUOTED = new RegExp(
  `(${SENSITIVE_KEY})(?:${SEP})(["'])(?:(?!\\2)[^\\r\\n]){0,512}\\2`,
  'gi',
)

/**
 * A sensitive key in `KEY = value` ENV-ASSIGNMENT form — a space/tab AFTER the
 * separator (the shape of an env dump / assignment log:
 * `PAYLOAD_SECRET = a long secret value`) — redacted to end of the value RUN (end
 * of line). Requiring the trailing space distinguishes it from an inline
 * `key=value` (handled token-wise below), so a spaced env value isn't truncated at
 * its first space.
 */
const SENSITIVE_ENV_ASSIGN = new RegExp(
  `(${SENSITIVE_KEY})(?:\\s*(?:[:=]|%3[aAdD])[ \\t]+)[^\\r\\n]{1,512}`,
  'gi',
)

/**
 * Inline `KEY=token` / `KEY: token` / `KEY%3Dtoken` (unquoted, no space after the
 * separator): redact the token to its end. The value is a BOUNDED negated class
 * (`{1,512}`, single quantifier) — no ReDoS; an over-long value's tail is caught by
 * the opaque-blob pass as a backstop.
 */
const SENSITIVE_KV = new RegExp(`(${SENSITIVE_KEY})(?:${SEP})"?[^\\s"'&,;)}\\]]{1,512}`, 'gi')

/** URL / connection-string userinfo: redact the WHOLE userinfo up to the LAST `@`. */
const URI_USERINFO = /\b([a-z][a-z0-9+.-]{0,20}):\/\/[^\s/]{1,256}@/gi

/** `Bearer|Basic|Digest <credential>` authorization values (single bounded quantifier). */
const AUTH_SCHEME = /\b(Bearer|Basic|Digest)\s+[A-Za-z0-9._~+/=-]{1,4096}/gi

/**
 * Scrubs a string of the known-sensitive patterns. Pass 0 is the PRIMARY,
 * bypass-proof defense — a verbatim string-replace of the app's own env-secret
 * values; passes 1-9 are the heuristic secondary net. Every regex uses only single
 * or bounded quantifiers (no nested unbounded `[...]*` around an alternation), so
 * with the caller's size guard scrub time is linear + bounded (ReDoS-safe).
 *
 *  0. The app's OWN env-secret values (verbatim string-replace — no regex).
 *  1. URL / connection-string USERINFO → `<scheme>://[REDACTED]@host` (whole
 *     userinfo up to the LAST `@`, so a `@` in the password is fully removed).
 *  2. `Bearer|Basic|Digest <credential>` authorization values.
 *  3. JSON-shaped `"key":"value"` for a sensitive key.
 *  4. sensitive key with a QUOTED value (entire quoted span, spaces and all).
 *  5. sensitive `KEY = value` env-assignment (to end of line).
 *  6. inline sensitive `KEY=token` (to end of token).
 *  7. JWT-shaped tokens (`eyJ….….…`).
 *  8. Email addresses (PII).
 *  9. Opaque token/secret blobs — hex runs (20+) and long base64 (40+).
 *
 * Over-redaction is intentional and safe: this store is admin-readable +
 * exportable, so a false positive (a redacted non-secret) is always preferable
 * to a false negative (a leaked secret).
 */
export function scrubSensitive(
  input: string,
  envSecretValues: string[] = collectEnvSecretValues(),
): string {
  let out = input

  // 0. PRIMARY: the app's own env-secret values, VERBATIM (O(n) per secret, plain
  //    string replace → no bypass by format/encoding/straddle, and no ReDoS).
  for (const secret of envSecretValues) {
    if (secret.length >= MIN_ENV_SECRET_LEN && out.includes(secret)) {
      out = out.split(secret).join(REDACTED)
    }
  }

  // 1. URL / connection-string userinfo. `[^\s/]{1,256}@` (single bounded
  //    quantifier) consumes up to the LAST `@` before the host authority, so an
  //    embedded `@` in the password (`user:p@ss@host`) is fully redacted.
  out = out.replace(URI_USERINFO, `$1://${REDACTED}@`)

  // 2. Authorization scheme credentials (Bearer / Basic / Digest).
  out = out.replace(AUTH_SCHEME, `$1 ${REDACTED}`)

  // 3. JSON `"key":"value"` for a sensitive key → redact the value in place.
  out = out.replace(SENSITIVE_JSON, (_m, key: string) => `"${key}":"${REDACTED}"`)

  // 4. sensitive key with a QUOTED value → redact the whole quoted span.
  out = out.replace(SENSITIVE_KV_QUOTED, (_m, key: string) => `${key}=${REDACTED}`)

  // 5. sensitive `KEY = value` env-assignment (space after sep) → redact to EOL.
  out = out.replace(SENSITIVE_ENV_ASSIGN, (_m, key: string) => `${key}=${REDACTED}`)

  // 6. inline sensitive `KEY=token` → redact the token.
  out = out.replace(SENSITIVE_KV, (_m, key: string) => `${key}=${REDACTED}`)

  // 7. JWT-shaped tokens (three base64url segments; the leading `eyJ` is a JSON
  //    header `{"` in base64url — a strong, low-false-positive signal).
  out = out.replace(
    /\beyJ[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}/g,
    REDACTED,
  )

  // 8. Email addresses (PII — never stored in the error log).
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, REDACTED)

  // 9. Opaque token/secret blobs — hex runs (20+: the ~20-hex reset-token shape,
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
  // Cut to the pathological-size guard (a plain slice), scrub the WHOLE thing,
  // THEN truncate to the stored digest size — so a secret/URI never straddles the
  // cut and loses its delimiter (NEW-1). See MAX_SCRUB_INPUT.
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
  // Cut to the pathological-size guard BEFORE splitting/scrubbing (the whole stack,
  // not just per-line, is bounded), then scrub, then truncate to the digest size.
  const capped = stack.length > MAX_SCRUB_INPUT ? stack.slice(0, MAX_SCRUB_INPUT) : stack
  // Collect the env-secret values ONCE and reuse for every line.
  const envSecrets = collectEnvSecretValues()
  const lines = capped
    .split('\n')
    .slice(0, MAX_STACK_FRAMES)
    .map((line) => scrubSensitive(line, envSecrets))
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
