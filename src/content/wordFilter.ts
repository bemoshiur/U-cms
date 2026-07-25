/**
 * Word-filter helpers (Task 3B Part 4; feature-inventory refs 1-38..1-41).
 *
 * Two independent legacy features share the same "does this text contain a
 * forbidden token" shape, so the matching primitive lives here once and both
 * the `posts` profanity gate and the (Phase-4) member-signup banned-word check
 * reuse it:
 *
 *  - PROFANITY (ref 1-38/1-39, `금칙어관리`) — an admin-curated list of words
 *    that must never appear in a post's title/body/extra fields. Enforced
 *    server-side by a `beforeValidate` hook on `posts` (see Posts.ts).
 *  - MEMBER BANNED WORDS (ref 1-40/1-41, `회원 금칙어`) — words disallowed in a
 *    member's login ID / password / anywhere, enforced at MEMBER signup.
 *    Members are a Phase-4 collection, so here we ship only the pure
 *    `checkBannedWord` predicate + its unit tests; Phase 4 wires it into the
 *    signup flow (documented seam in task-3B-report.md).
 *
 * ## Matching semantics — case-insensitive SUBSTRING (documented choice)
 *
 * Legacy U-CMS is a Korean CMS. Korean text has no whitespace word
 * boundaries (`\b` is meaningless mid-Hangul), so a word-boundary matcher
 * would miss the overwhelming majority of real Korean profanity. We therefore
 * match a **case-insensitive substring**. The known trade-off is Latin-script
 * over-matching (a filter word "ass" would also flag "assistant"); this is
 * accepted and mitigated operationally by curating the word list (the same
 * posture legacy took). The matcher never returns or echoes the matched word
 * (see `containsAnyWord` returning a boolean, never the hit) so an error
 * message can be shown without ever surfacing a slur — a hard requirement.
 */

/** The scopes a member banned word can apply to (ref 1-41). */
export const MEMBER_BANNED_WORD_SCOPES = ['common', 'loginId', 'password'] as const

export type MemberBannedWordScope = (typeof MEMBER_BANNED_WORD_SCOPES)[number]

/** A member-banned-word record shape (the subset the predicate needs). */
export type BannedWordLike = {
  word: string
  scope?: MemberBannedWordScope | null
  isActive?: boolean | null
}

/**
 * True iff `text` contains any of `words` as a case-insensitive substring.
 * Blank/`undefined` filter words are ignored (they would match everything).
 * Returns only a boolean — never the offending word — so callers can build an
 * error message without echoing a slur.
 */
export function containsAnyWord(text: string, words: readonly string[]): boolean {
  if (typeof text !== 'string' || text.length === 0) {
    return false
  }
  const haystack = text.toLowerCase()
  for (const raw of words) {
    if (typeof raw !== 'string') {
      continue
    }
    const needle = raw.trim().toLowerCase()
    if (needle.length === 0) {
      continue
    }
    if (haystack.includes(needle)) {
      return true
    }
  }
  return false
}

/**
 * PROFANITY gate primitive — true iff `text` contains any ACTIVE profanity
 * word. `words` are the raw `profanityWords` rows; only `isActive !== false`
 * rows count (an inactive word is disabled, not deleted — ref 1-39's
 * activate/deactivate toggle). Returns a boolean only (never the word).
 */
export function containsProfanity(
  text: string,
  words: readonly { word: string; isActive?: boolean | null }[],
): boolean {
  const active = words.filter((w) => w.isActive !== false).map((w) => w.word)
  return containsAnyWord(text, active)
}

/**
 * MEMBER banned-word predicate (ref 1-41) — true iff `value` violates the
 * banned-word policy for the given `scope`. A word applies when it is active
 * AND its own scope is either `common` (applies everywhere) or exactly the
 * scope being checked. Example: checking a login ID (`scope: 'loginId'`)
 * tests every `common` word plus every `loginId` word, but NOT `password`-only
 * words. Returns a boolean only, never the matched word.
 *
 * This is the pure core the Phase-4 member-signup flow calls once per field
 * (loginId, password). Kept side-effect-free + fully unit-tested here.
 */
export function checkBannedWord(
  value: string,
  scope: Exclude<MemberBannedWordScope, 'common'>,
  words: readonly BannedWordLike[],
): boolean {
  const applicable = words
    .filter((w) => w.isActive !== false)
    .filter((w) => (w.scope ?? 'common') === 'common' || w.scope === scope)
    .map((w) => w.word)
  return containsAnyWord(value, applicable)
}

/**
 * Recursively collects all plain-text from a Lexical richText editor-state
 * value (the shape Payload's `richText` field stores:
 * `{ root: { children: [...] } }`, where text nodes carry a `text` string).
 * Used to feed a post's body/answer into the profanity gate. Tolerant of
 * `null`/malformed input (returns `''`).
 */
export function extractLexicalText(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return ''
  }
  const root = (value as { root?: unknown }).root
  const parts: string[] = []

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return
    }
    const n = node as { text?: unknown; children?: unknown }
    if (typeof n.text === 'string') {
      parts.push(n.text)
    }
    if (Array.isArray(n.children)) {
      for (const child of n.children) {
        walk(child)
      }
    }
  }

  walk(root ?? value)
  return parts.join(' ')
}
