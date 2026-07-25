import type { Payload, PayloadRequest, Where } from 'payload'
import { APIError } from 'payload'

import { getPublicSiteId } from '../site/config'
import { renderMemberFindIdEmail } from '../email/memberEmails'

/**
 * Public-site MEMBER ID / password recovery (Task 4B Part 2; ref 1-3, member
 * variant). Mirrors the admin `src/accounts/recovery.ts`: both flows apply only
 * to ACTIVE members on the active site and ALWAYS return a generic response —
 * never revealing whether a matching account exists (no enumeration oracle). The
 * generic message is returned by the caller; these functions never throw for a
 * "not found" case.
 *
 * Scoped to the active public site's tenant so a login ID (unique only per site)
 * resolves unambiguously.
 */

const GENERIC_MEMBER_FIND_ID_MESSAGE =
  'If an active member matches the name and email provided, its login ID has been emailed to that address.'
const GENERIC_MEMBER_FIND_PASSWORD_MESSAGE =
  'If an active member matches the details provided, a password reset link has been emailed to that address.'

export { GENERIC_MEMBER_FIND_ID_MESSAGE, GENERIC_MEMBER_FIND_PASSWORD_MESSAGE }

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function activeSiteTenantId(
  payload: Payload,
  siteId: string,
  req?: PayloadRequest,
): Promise<number | string | null> {
  const sites = await payload.find({
    collection: 'sites',
    where: { siteId: { equals: siteId } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const site = sites.docs[0]
  return site && !site.isAdminSite ? site.id : null
}

/** Find member ID: name + email → email the ACTIVE member's login ID (generic). */
export async function findMemberId(
  payload: Payload,
  input: { name?: unknown; email?: unknown },
  options: { siteId?: string } = {},
  req?: PayloadRequest,
): Promise<{ message: string; emailed: boolean }> {
  const name = asTrimmedString(input.name)
  const email = asTrimmedString(input.email)
  if (!name || !email) {
    return { message: GENERIC_MEMBER_FIND_ID_MESSAGE, emailed: false }
  }
  const tenantId = await activeSiteTenantId(payload, options.siteId ?? getPublicSiteId(), req)
  if (tenantId === null) {
    return { message: GENERIC_MEMBER_FIND_ID_MESSAGE, emailed: false }
  }

  const found = await payload.find({
    collection: 'members',
    where: {
      and: [
        { tenant: { equals: tenantId } },
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
  const member = found.docs[0]
  if (member?.loginId) {
    await payload.sendEmail({
      to: email,
      subject: 'Your Pulse CMS member login ID',
      html: renderMemberFindIdEmail(String(member.loginId)),
    })
    return { message: GENERIC_MEMBER_FIND_ID_MESSAGE, emailed: true }
  }
  return { message: GENERIC_MEMBER_FIND_ID_MESSAGE, emailed: false }
}

/**
 * Find member PW: (loginId?) + email → trigger Payload's forgotPassword for the
 * ACTIVE member on the active site (emails a reset link). Generic no-op when no
 * active match. Only fires after confirming an ACTIVE match, since
 * `payload.forgotPassword` alone would reset any-status accounts.
 */
export async function findMemberPassword(
  payload: Payload,
  input: { loginId?: unknown; email?: unknown },
  options: { siteId?: string } = {},
  req?: PayloadRequest,
): Promise<{ message: string; emailed: boolean }> {
  const loginId = asTrimmedString(input.loginId).toLowerCase()
  const email = asTrimmedString(input.email)
  if (!email) {
    return { message: GENERIC_MEMBER_FIND_PASSWORD_MESSAGE, emailed: false }
  }
  const tenantId = await activeSiteTenantId(payload, options.siteId ?? getPublicSiteId(), req)
  if (tenantId === null) {
    return { message: GENERIC_MEMBER_FIND_PASSWORD_MESSAGE, emailed: false }
  }

  const and: Where[] = [
    { tenant: { equals: tenantId } },
    { email: { equals: email } },
    { status: { equals: 'active' } },
  ]
  if (loginId) {
    and.push({ loginId: { equals: loginId } })
  }
  const found = await payload.find({
    collection: 'members',
    where: { and },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  if (found.docs.length > 0) {
    try {
      await payload.forgotPassword({ collection: 'members', data: { email }, req })
      return { message: GENERIC_MEMBER_FIND_PASSWORD_MESSAGE, emailed: true }
    } catch (error) {
      // Swallow ONLY a rate-limit 429 and return the same generic no-op a
      // non-match yields, so matching vs non-matching stays indistinguishable
      // (no existence oracle — mirrors admin recovery's D1 fix).
      if (error instanceof APIError && error.status === 429) {
        return { message: GENERIC_MEMBER_FIND_PASSWORD_MESSAGE, emailed: false }
      }
      throw error
    }
  }
  return { message: GENERIC_MEMBER_FIND_PASSWORD_MESSAGE, emailed: false }
}
