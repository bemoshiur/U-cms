import type { Payload, PayloadRequest, Where } from 'payload'
import { APIError } from 'payload'

import { renderFindIdEmail } from '../email/authEmails'

/**
 * Admin ID / password recovery (legacy 관리자 ID/PW 찾기 — ref 1-3; Task 1D
 * brief Part 4).
 *
 * Both flows apply only to ACTIVE (approved) accounts and ALWAYS return a
 * generic response — they never reveal whether a matching account exists
 * (avoids account enumeration). The generic message is returned by the
 * endpoint layer; these functions just do the work and never throw for a
 * "not found" case.
 */

const GENERIC_FIND_ID_MESSAGE =
  'If an active account matches the name and email provided, its login ID has been emailed to that address.'
const GENERIC_FIND_PASSWORD_MESSAGE =
  'If an active account matches the details provided, a password reset link has been emailed to that address.'

export { GENERIC_FIND_ID_MESSAGE, GENERIC_FIND_PASSWORD_MESSAGE }

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Find ID: name + email → email the ACTIVE account's login ID to that email.
 * No-op (still generic) when there's no active match or the match has no
 * `loginId`.
 */
export async function findId(
  payload: Payload,
  input: { name?: unknown; email?: unknown },
  req?: PayloadRequest,
): Promise<{ message: string; emailed: boolean }> {
  const name = asTrimmedString(input.name)
  const email = asTrimmedString(input.email)

  if (!name || !email) {
    return { message: GENERIC_FIND_ID_MESSAGE, emailed: false }
  }

  const found = await payload.find({
    collection: 'users',
    where: {
      and: [
        { name: { equals: name } },
        { email: { equals: email } },
        { status: { equals: 'active' } },
      ],
    },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const user = found.docs[0]
  if (user?.loginId) {
    await payload.sendEmail({
      to: email,
      subject: 'Your Pulse CMS login ID',
      html: renderFindIdEmail(String(user.loginId)),
    })
    return { message: GENERIC_FIND_ID_MESSAGE, emailed: true }
  }

  return { message: GENERIC_FIND_ID_MESSAGE, emailed: false }
}

/**
 * Find PW: (loginId?) + email → trigger Payload's forgotPassword flow for the
 * ACTIVE account, which emails a reset link via the collection's configured
 * `generateEmailHTML`. No-op (still generic) when there's no active match.
 *
 * We only invoke `payload.forgotPassword` after confirming an ACTIVE account
 * matches — `payload.forgotPassword` alone would happily reset a
 * pending/dormant account too, which ref 1-3 forbids ("approved accounts
 * only").
 */
export async function findPassword(
  payload: Payload,
  input: { loginId?: unknown; email?: unknown },
  req?: PayloadRequest,
): Promise<{ message: string; emailed: boolean }> {
  const loginId = asTrimmedString(input.loginId)
  const email = asTrimmedString(input.email)

  if (!email) {
    return { message: GENERIC_FIND_PASSWORD_MESSAGE, emailed: false }
  }

  const conditions: Where[] = [{ email: { equals: email } }, { status: { equals: 'active' } }]
  // When a login ID is supplied it must also match — otherwise match on email
  // alone (supports accounts, like the seeded super-admin, that have no
  // login ID).
  if (loginId) {
    conditions.push({ loginId: { equals: loginId } })
  }

  const found = await payload.find({
    collection: 'users',
    where: { and: conditions },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })

  if (found.docs.length > 0) {
    try {
      await payload.forgotPassword({
        collection: 'users',
        data: { email },
        req,
      })
      return { message: GENERIC_FIND_PASSWORD_MESSAGE, emailed: true }
    } catch (error) {
      // D1 (existence-oracle fix): the built-in `users/forgot-password`
      // operation gate (`rateLimitPasswordRecovery`) throws a 429 when its
      // bucket is exhausted. Surfacing that 429 here — while a NON-matching
      // email falls through to the generic 200 below — would make matching vs.
      // non-matching distinguishable, a deterministic account-existence oracle
      // (CWE-204). Swallow ONLY the rate-limit 429 and return the SAME generic
      // response a non-match yields, so the two are indistinguishable. The
      // endpoint-level `find-password` gate already throttles volume on this
      // path, so the operation gate is redundant here. Anything else re-throws.
      if (error instanceof APIError && error.status === 429) {
        return { message: GENERIC_FIND_PASSWORD_MESSAGE, emailed: false }
      }
      throw error
    }
  }

  return { message: GENERIC_FIND_PASSWORD_MESSAGE, emailed: false }
}
