/**
 * Password composition policy enforcement (legacy ref 3-9 비밀번호 작성 규칙;
 * Task 1D brief Part 2).
 *
 * ## The code/DB split (deliberate, per the brief)
 *
 * Legacy U-CMS stored an *editable, human-readable* password rule text in the
 * DB (the `passwordPolicies` collection here) and displayed the most-recently
 * created active one to users — but the ACTUAL enforcement was a fixed set of
 * code rules. We keep that split intentionally:
 *
 *  - This pure function is the single source of truth for what is actually
 *    *rejected* — it encodes the fixed legacy rule and never reads the DB.
 *  - `passwordPolicies` (the collection) holds the human-readable text shown
 *    to users + an audit history of rule versions. Editing that text does NOT
 *    change what this function enforces (matching legacy behavior, where the
 *    displayed text and the enforced rule were maintained separately).
 *
 * Keeping the validator pure (no `payload`/DB access) is what lets it run in
 * a synchronous field/collection hook and be unit-tested exhaustively without
 * booting Payload.
 *
 * ## The rule (legacy ref 3-9, verbatim intent)
 *
 * Character classes are the three legacy classes: **letters** (a–z, A–Z, as a
 * single class — legacy 영문 does not split upper/lower), **digits** (0–9), and
 * **special characters** (everything else). Then:
 *
 *  - ≥ 2 classes  → minimum length 10
 *  - all 3 classes → minimum length 8
 *  - < 2 classes  → always rejected (a single-class password can never satisfy
 *    "combine 2+ of the 3 classes")
 *
 * Plus two "easily-guessable" rejections from ref 3-9's recommendation text:
 *  - must not contain (or equal) the login ID, case-insensitively
 *  - must not contain an obvious sequence (see {@link SEQUENCE_BLOCKLIST} and
 *    the generic consecutive-run detector below)
 *
 * Birthdays/phone numbers (also named in ref 3-9) are not mechanically
 * detectable without the user's personal data and are treated as advisory
 * only — documented here rather than silently dropped.
 */

/**
 * Explicit substrings rejected outright (case-insensitive). These are the
 * common keyboard-walk / repeated-token patterns that the generic
 * consecutive-run detector below can't catch because they aren't
 * code-point-consecutive. Kept intentionally small and obvious; extend
 * deliberately.
 *
 * NOTE: dictionary words (e.g. "password") are deliberately NOT in this list —
 * ref 3-9 targets *sequences and guessable personal data*, not a dictionary,
 * and a dictionary blocklist here would false-reject legitimate passphrases.
 */
export const SEQUENCE_BLOCKLIST: readonly string[] = [
  'qwerty',
  'qwertz',
  'azerty',
  'asdfgh',
  'zxcvbn',
  'qazwsx',
  'qweasd',
  '1qaz',
  '2wsx',
  'zaq1',
]

/** Minimum login-ID length before the "password contains login ID" check applies. */
const MIN_LOGIN_ID_LEN_FOR_CONTAINS_CHECK = 3

/** Minimum length of a consecutive ascending/descending run treated as a "sequence". */
const MIN_SEQUENCE_RUN = 4

export type ValidatePasswordContext = {
  /**
   * The account's login identifier (loginId when present, otherwise the
   * email or its local-part). Used only for the "must not contain the login
   * ID" check. Optional — when absent/short, that check is skipped.
   */
  userId?: string | null
}

function countCharacterClasses(pw: string): number {
  let classes = 0
  if (/[a-zA-Z]/.test(pw)) classes++
  if (/[0-9]/.test(pw)) classes++
  if (/[^a-zA-Z0-9]/.test(pw)) classes++
  return classes
}

/** True if `pw` (lowercased) contains any explicit blocklisted sequence. */
function containsBlocklistedSequence(lowerPw: string): boolean {
  return SEQUENCE_BLOCKLIST.some((seq) => lowerPw.includes(seq))
}

/**
 * True if `pw` contains a run of {@link MIN_SEQUENCE_RUN}+ characters that are
 * consecutive by code point in the same class (all digits or all letters),
 * ascending or descending — catches 1234, 4321, abcd, dcba, wxyz, 6789, etc.
 */
function containsConsecutiveRun(lowerPw: string): boolean {
  const isDigit = (c: string) => c >= '0' && c <= '9'
  const isLetter = (c: string) => c >= 'a' && c <= 'z'
  const sameClass = (a: string, b: string) =>
    (isDigit(a) && isDigit(b)) || (isLetter(a) && isLetter(b))

  const chars = [...lowerPw]
  let ascRun = 1
  let descRun = 1
  for (let i = 1; i < chars.length; i++) {
    const prev = chars[i - 1] as string
    const cur = chars[i] as string
    const diff = cur.charCodeAt(0) - prev.charCodeAt(0)

    ascRun = sameClass(prev, cur) && diff === 1 ? ascRun + 1 : 1
    descRun = sameClass(prev, cur) && diff === -1 ? descRun + 1 : 1

    if (ascRun >= MIN_SEQUENCE_RUN || descRun >= MIN_SEQUENCE_RUN) {
      return true
    }
  }
  return false
}

/**
 * Validates a plaintext password against the fixed legacy policy (ref 3-9).
 * Returns `true` when acceptable, or a readable failure message string when
 * not — matching Payload's field-`validate` return convention so it can be
 * surfaced verbatim to the user.
 */
export function validatePassword(
  password: unknown,
  { userId }: ValidatePasswordContext = {},
): string | true {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.'
  }

  const classes = countCharacterClasses(password)
  if (classes < 2) {
    return 'Password must combine at least two of: letters, numbers, and special characters.'
  }

  const minLength = classes >= 3 ? 8 : 10
  if (password.length < minLength) {
    return classes >= 3
      ? 'Password must be at least 8 characters when combining letters, numbers, and special characters.'
      : 'Password must be at least 10 characters when combining two character types (or at least 8 characters when combining all three: letters, numbers, and special characters).'
  }

  const lowerPw = password.toLowerCase()

  if (containsBlocklistedSequence(lowerPw) || containsConsecutiveRun(lowerPw)) {
    return 'Password must not contain simple sequences such as "1234", "abcd", or "qwerty".'
  }

  if (typeof userId === 'string') {
    const lowerId = userId.toLowerCase().trim()
    if (lowerId.length >= MIN_LOGIN_ID_LEN_FOR_CONTAINS_CHECK && lowerPw.includes(lowerId)) {
      return 'Password must not contain your login ID.'
    }
  }

  return true
}
