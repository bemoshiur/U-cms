/**
 * Member password composition policy (Task 4B Part 2).
 *
 * ## Deliberately LIGHTER than the admin policy (documented)
 *
 * Admin accounts (`validatePassword.ts`, legacy ref 3-9) enforce a stricter
 * rule — ≥2 character classes with a 10-char minimum (8 with all three), plus a
 * sequence/keyboard-walk blocklist and a "must not contain the login ID" check —
 * because an admin credential guards the whole back-office. Public-site MEMBERS
 * are a lower-privilege audience (they can never reach `/admin` — see
 * task-4B-report.md), so their policy is intentionally friendlier while still
 * refusing genuinely weak secrets:
 *
 *  - minimum length 8 (vs 10 for a 2-class admin password),
 *  - at least TWO of {letters, digits, symbols} (blocks single-class secrets
 *    like "12345678" or "aaaaaaaa"),
 *  - must not CONTAIN the member's login ID (the one cheap, high-value guessable
 *    check kept from the admin policy).
 *
 * The keyboard-walk/sequence blocklist is intentionally NOT applied to members
 * (it produced the most friction for the least security value). Kept a pure,
 * DB-free function so it runs in a sync field/collection hook and is exhaustively
 * unit-testable without booting Payload (mirrors `validatePassword`).
 */

/** Minimum member password length. */
export const MEMBER_PASSWORD_MIN_LENGTH = 8

/** Minimum login-ID length before the "password contains login ID" check applies. */
const MIN_LOGIN_ID_LEN_FOR_CONTAINS_CHECK = 3

export type ValidateMemberPasswordContext = {
  /**
   * The member's login identifier (loginId, else the email/local-part). Used
   * only for the "must not contain the login ID" check. Optional — skipped when
   * absent/short.
   */
  loginId?: string | null
}

function countCharacterClasses(pw: string): number {
  let classes = 0
  if (/[a-zA-Z]/.test(pw)) classes++
  if (/[0-9]/.test(pw)) classes++
  if (/[^a-zA-Z0-9]/.test(pw)) classes++
  return classes
}

/**
 * Validates a plaintext member password against the lighter member policy.
 * Returns `true` when acceptable, or a readable failure message otherwise
 * (Payload's field-`validate` convention, so it can surface verbatim).
 */
export function validateMemberPassword(
  password: unknown,
  { loginId }: ValidateMemberPasswordContext = {},
): string | true {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.'
  }
  if (password.length < MEMBER_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${MEMBER_PASSWORD_MIN_LENGTH} characters.`
  }
  if (countCharacterClasses(password) < 2) {
    return 'Password must include at least two of: letters, numbers, and symbols.'
  }
  if (typeof loginId === 'string') {
    const lowerId = loginId.toLowerCase().trim()
    if (
      lowerId.length >= MIN_LOGIN_ID_LEN_FOR_CONTAINS_CHECK &&
      password.toLowerCase().includes(lowerId)
    ) {
      return 'Password must not contain your login ID.'
    }
  }
  return true
}
