/**
 * PII masking utilities (Task 2A Part 5; feature-inventory ref 3-7 shows the
 * legacy `ha***g` login-ID masking, ref 3-1/3-2/3-3 mask name/ID columns).
 *
 * ## Display-only, never storage
 *
 * The legacy Privacy Protection System **stores the real identity** on every
 * audit/login row (non-repudiation — see the business rules on refs 1-55,
 * 3-1, 3-6: "the log stores real identity data"), and masks that identity
 * only in the admin **list views**. These functions therefore run in the
 * admin UI (via a field `admin.components.Cell` — see
 * `src/components/audit/MaskedCell.tsx`), never on the write path. The stored
 * `actorLabel`/`userLabel`/`loginId` values are always the real ones; masking
 * is a presentation concern layered on top at render time.
 *
 * All functions are pure (no I/O, no globals) so they are cheaply
 * unit-testable and identical on server and client — see
 * `tests/unit/mask.spec.ts`.
 */

const STARS = '***'

/**
 * Masks a login ID / account identifier, legacy `ha***g` style: keep the
 * first 2 and last 1 characters, replace the middle with a fixed 3-star run
 * (fixed length, so the exact identifier length is not leaked). Short strings
 * degrade gracefully rather than revealing everything:
 *
 *  - `''`          → `''`
 *  - `'a'`         → `'*'`      (a lone character reveals the whole value)
 *  - `'ab'`        → `'a*'`
 *  - `'abc'`       → `'a**'`
 *  - `'hasung'`    → `'ha***g'` (the legacy example)
 *  - `'administrator'` → `'ad***r'`
 */
export function maskId(value: string): string {
  const s = value ?? ''
  const n = s.length
  if (n === 0) {
    return ''
  }
  if (n === 1) {
    return '*'
  }
  if (n === 2) {
    return `${s[0]}*`
  }
  if (n === 3) {
    return `${s[0]}**`
  }
  return `${s.slice(0, 2)}${STARS}${s.slice(-1)}`
}

/**
 * Masks a personal name, keeping the first and last character and starring
 * the middle (the common Korean-government convention, e.g. `홍길동` → `홍*동`).
 * Unlike {@link maskId}, the middle star run matches the middle length so a
 * two-character name still yields a recognizable shape.
 *
 *  - `''`        → `''`
 *  - `'김'`      → `'*'`
 *  - `'김수'`    → `'김*'`
 *  - `'홍길동'`  → `'홍*동'`
 *  - `'강현아'`  → `'강*아'`
 *  - `'John Doe'`→ `'J******e'`
 */
export function maskName(value: string): string {
  const s = value ?? ''
  const n = s.length
  if (n === 0) {
    return ''
  }
  if (n === 1) {
    return '*'
  }
  if (n === 2) {
    return `${s[0]}*`
  }
  return `${s[0]}${'*'.repeat(n - 2)}${s.slice(-1)}`
}

/**
 * Masks an email address to `a***@domain`: keep the first character of the
 * local part, star the rest of the local part (fixed 3-star run), keep the
 * domain verbatim (the domain is not itself considered PII here — the legacy
 * screenshots show the domain, e.g. `unpl.co.kr`, unmasked).
 *
 *  - `'alice@example.com'` → `'a***@example.com'`
 *  - `'a@x.com'`           → `'a***@x.com'`
 *  - `'@domain'`           → `'***@domain'`
 *  - a value with no `@`   → falls back to {@link maskId}.
 */
export function maskEmail(value: string): string {
  const s = value ?? ''
  if (s.length === 0) {
    return ''
  }
  const at = s.indexOf('@')
  if (at === -1) {
    // Not an email — mask it like an identifier rather than leaking it whole.
    return maskId(s)
  }
  const local = s.slice(0, at)
  const domain = s.slice(at + 1)
  const localMask = local.length === 0 ? STARS : `${local[0]}${STARS}`
  return `${localMask}@${domain}`
}

/**
 * Masks a denormalized actor label of the form `name(id)` (the shape produced
 * by `resolveActorLabel` in `src/audit/helpers.ts`), masking the name part
 * with {@link maskName} and the id part with {@link maskId}, e.g.
 * `'강현아(hasung)'` → `'강*아(ha***g)'`. A bare label with no parenthesized id
 * is masked as a name.
 */
export function maskLabel(value: string): string {
  const s = value ?? ''
  if (s.length === 0) {
    return ''
  }
  const match = s.match(/^(.*)\(([^()]*)\)$/)
  if (match) {
    return `${maskName(match[1] ?? '')}(${maskId(match[2] ?? '')})`
  }
  return maskName(s)
}
