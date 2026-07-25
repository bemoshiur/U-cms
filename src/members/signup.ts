import type { Payload, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { validateMemberPassword } from '../auth/validateMemberPassword'
import { checkBannedWord, type BannedWordLike } from '../content/wordFilter'
import { getPublicSiteId } from '../site/config'
import { buildTermsConsents } from './terms'

/**
 * Public-site member self-service sign-up (Task 4B Part 2; refs 2-13 회원가입).
 *
 * Creates a `members` doc on the ACTIVE public site (tenant). Security-critical,
 * mirroring the admin `accountRequest.ts`: the record is created server-side
 * with `overrideAccess: true`, and `tenant` + `status` are FORCE-SET here from
 * server state — client-supplied `tenant`/`status`/`roles` are NEVER read (see
 * {@link pickAllowedFields}). So a hostile signer-up cannot self-approve, plant
 * themselves on another site, or grant a privilege. This is the endpoint
 * counterpart to the field-level gates on `members.status`/`tenant`/`loginId`.
 *
 * Also enforced here, before the create: the member password policy, the
 * member banned-word list (loginId + display name + password), the required
 * terms agreement (snapshotted as consent evidence), and site-scoped
 * loginId / global email uniqueness.
 */

export type MemberSignupInput = {
  loginId?: unknown
  email?: unknown
  name?: unknown
  mobile?: unknown
  password?: unknown
  confirmPassword?: unknown
  marketingConsent?: unknown
  agreeService?: unknown
  agreePrivacy?: unknown
  // NOTE: `status`/`tenant`/`roles` may appear in a hostile payload —
  // intentionally absent from the allow-list below and never read.
  [key: string]: unknown
}

/** Thrown for a client-correctable sign-up problem; carries an HTTP status. */
export class MemberSignupError extends APIError {}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on' || value === '1'
}

/**
 * Extracts ONLY the fields a member is allowed to set. `status`/`tenant`/`roles`
 * are deliberately not among them — the core of the privilege-stripping guarantee.
 */
function pickAllowedFields(input: MemberSignupInput) {
  return {
    loginId: asTrimmedString(input.loginId).toLowerCase(),
    email: asTrimmedString(input.email),
    name: asTrimmedString(input.name),
    mobile: asTrimmedString(input.mobile),
    password: typeof input.password === 'string' ? input.password : '',
    confirmPassword: typeof input.confirmPassword === 'string' ? input.confirmPassword : '',
    marketingConsent: asBoolean(input.marketingConsent),
    agreeService: asBoolean(input.agreeService),
    agreePrivacy: asBoolean(input.agreePrivacy),
  }
}

export type MemberSignupResult = { ok: true; id: number | string; status: string }

export async function submitMemberSignup(
  payload: Payload,
  input: MemberSignupInput,
  options: { siteId?: string } = {},
  req?: PayloadRequest,
): Promise<MemberSignupResult> {
  const siteId = options.siteId ?? getPublicSiteId()

  // Resolve the active public site (tenant). Sign-up targets the PUBLIC site
  // only — never an admin back-office site.
  const sites = await payload.find({
    collection: 'sites',
    where: { siteId: { equals: siteId } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const site = sites.docs[0]
  if (!site || site.isAdminSite) {
    throw new MemberSignupError('Sign-up is not available on this site.', 403)
  }

  const fields = pickAllowedFields(input)

  if (!fields.loginId) throw new MemberSignupError('Login ID is required.', 400)
  if (!fields.email) throw new MemberSignupError('Email is required.', 400)
  if (!fields.name) throw new MemberSignupError('Name is required.', 400)
  if (!fields.password) throw new MemberSignupError('Password is required.', 400)
  if (fields.password !== fields.confirmPassword) {
    throw new MemberSignupError('Password and confirmation do not match.', 400)
  }

  const pwResult = validateMemberPassword(fields.password, { loginId: fields.loginId })
  if (pwResult !== true) {
    throw new MemberSignupError(pwResult, 400)
  }

  // Required terms must be agreed (Part 3). Snapshotted below as consent evidence.
  if (!fields.agreeService || !fields.agreePrivacy) {
    throw new MemberSignupError('You must agree to the required terms to sign up.', 400)
  }

  // Banned-word gate (refs 1-40/1-41): the login ID + display name (nickname)
  // are checked against `common` + `loginId` words; the password against
  // `common` + `password` words. Never echoes the matched word.
  const banned = await payload.find({
    collection: 'memberBannedWords',
    where: { isActive: { equals: true } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const words = banned.docs as BannedWordLike[]
  if (
    checkBannedWord(fields.loginId, 'loginId', words) ||
    checkBannedWord(fields.name, 'loginId', words)
  ) {
    throw new MemberSignupError('That login ID or name is not allowed. Please choose another.', 400)
  }
  if (checkBannedWord(fields.password, 'password', words)) {
    throw new MemberSignupError('That password is not allowed. Please choose another.', 400)
  }

  // Uniqueness: loginId within THIS site (tenant); email globally (Payload's
  // auth-email uniqueness, stricter than per-site — see Members.ts).
  const loginIdTaken = await payload.find({
    collection: 'members',
    where: { and: [{ tenant: { equals: site.id } }, { loginId: { equals: fields.loginId } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  if (loginIdTaken.docs.length > 0) {
    throw new MemberSignupError('This login ID is already in use on this site.', 409)
  }
  const emailTaken = await payload.find({
    collection: 'members',
    where: { email: { equals: fields.email } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  if (emailTaken.docs.length > 0) {
    throw new MemberSignupError('An account with this email already exists.', 409)
  }

  // Per-site policy: approval-required sites create `pending` members (an admin
  // must activate); otherwise members are `active` immediately (legacy default).
  const status = site.memberApprovalRequired ? 'pending' : 'active'

  // Server create: FORCE tenant + status; snapshot the accepted terms as
  // immutable-ish consent evidence. Client tenant/status/roles were never read.
  const created = await payload.create({
    collection: 'members',
    data: {
      loginId: fields.loginId,
      email: fields.email,
      name: fields.name,
      password: fields.password,
      ...(fields.mobile ? { mobile: fields.mobile } : {}),
      marketingConsent: fields.marketingConsent,
      tenant: site.id,
      status,
      termsConsents: buildTermsConsents(),
    },
    overrideAccess: true,
    req,
  })

  return { ok: true, id: created.id, status }
}
