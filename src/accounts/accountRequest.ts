import type { Payload, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { validatePassword } from '../auth/validatePassword'

/**
 * Self-service admin account application (legacy 관리자 계정 신청 — refs 1-1,
 * 1-2; Task 1D brief Part 3).
 *
 * Creates a `users` doc in `status: pending` with NO roles. Security-critical:
 * the account is created server-side with `overrideAccess: true` and the
 * `status`/`roles` are FORCE-SET here — any client-supplied `status`/`roles`
 * in the request body are never read (see `pickAllowedFields`), so a hostile
 * applicant cannot self-approve or self-grant a role. This is the endpoint
 * counterpart to the field-level gates on `users.status`/`users.roles`.
 */

export type AccountRequestInput = {
  loginId?: unknown
  email?: unknown
  name?: unknown
  mobile?: unknown
  extension?: unknown
  department?: unknown
  password?: unknown
  confirmPassword?: unknown
  // NOTE: `status`/`roles` may appear in a hostile payload — intentionally
  // absent from the allow-list below and never read.
  [key: string]: unknown
}

/** Thrown for a client-correctable problem; carries an HTTP status. */
export class AccountRequestError extends APIError {}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Coerces a submitted relationship id to the numeric id this project uses
 * (Postgres integer ids — see payload.config.ts). Accepts a number or a
 * numeric string; anything else (including an object) yields `undefined`.
 */
function asRelationId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

/**
 * Extracts ONLY the fields an applicant is allowed to set. `status` and
 * `roles` are deliberately not among them — this is the core of the
 * privilege-stripping guarantee.
 */
function pickAllowedFields(input: AccountRequestInput) {
  return {
    loginId: asTrimmedString(input.loginId),
    email: asTrimmedString(input.email),
    name: asTrimmedString(input.name),
    mobile: asTrimmedString(input.mobile),
    extension: asTrimmedString(input.extension),
    department: asRelationId(input.department), // relationship id (or undefined)
    password: typeof input.password === 'string' ? input.password : '',
    confirmPassword: typeof input.confirmPassword === 'string' ? input.confirmPassword : '',
  }
}

/**
 * True when self-service account applications are enabled — i.e. some admin
 * site (`isAdminSite: true`) has `accountApplicationEnabled: true` (ref 1-1:
 * the login-page "Account Request" button is driven by the site's signup
 * toggle).
 */
async function accountApplicationEnabled(payload: Payload, req?: PayloadRequest): Promise<boolean> {
  const found = await payload.find({
    collection: 'sites',
    where: {
      and: [{ isAdminSite: { equals: true } }, { accountApplicationEnabled: { equals: true } }],
    },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return found.docs.length > 0
}

export type AccountRequestResult = { ok: true; id: number | string }

export async function submitAccountRequest(
  payload: Payload,
  input: AccountRequestInput,
  req?: PayloadRequest,
): Promise<AccountRequestResult> {
  if (!(await accountApplicationEnabled(payload, req))) {
    throw new AccountRequestError('Account applications are not currently enabled.', 403)
  }

  const fields = pickAllowedFields(input)

  if (!fields.loginId) throw new AccountRequestError('Login ID is required.', 400)
  if (!fields.email) throw new AccountRequestError('Email is required.', 400)
  if (!fields.name) throw new AccountRequestError('Name is required.', 400)
  if (!fields.password) throw new AccountRequestError('Password is required.', 400)
  if (fields.password !== fields.confirmPassword) {
    throw new AccountRequestError('Password and confirmation do not match.', 400)
  }

  // Enforce the password policy up-front for a clean 400 (the collection hook
  // would also catch it, but this yields a targeted message and avoids a
  // partial uniqueness probe on an invalid password).
  const pwResult = validatePassword(fields.password, { userId: fields.loginId })
  if (pwResult !== true) {
    throw new AccountRequestError(pwResult, 400)
  }

  // Uniqueness pre-checks (admin emails + login IDs must be unique — ref 1-2).
  // The DB unique indexes are the real backstop; these give friendly messages.
  const emailTaken = await payload.find({
    collection: 'users',
    where: { email: { equals: fields.email } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  if (emailTaken.docs.length > 0) {
    throw new AccountRequestError('An account with this email already exists.', 409)
  }

  const loginIdTaken = await payload.find({
    collection: 'users',
    where: { loginId: { equals: fields.loginId } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  if (loginIdTaken.docs.length > 0) {
    throw new AccountRequestError('An account with this login ID already exists.', 409)
  }

  // Server-side create: FORCE status=pending and roles=[]. Client-supplied
  // status/roles were never read. `overrideAccess` bypasses field gates, so
  // the forced values below are authoritative.
  const created = await payload.create({
    collection: 'users',
    data: {
      loginId: fields.loginId,
      email: fields.email,
      name: fields.name,
      password: fields.password,
      ...(fields.mobile ? { mobile: fields.mobile } : {}),
      ...(fields.extension ? { extension: fields.extension } : {}),
      ...(fields.department !== undefined ? { department: fields.department } : {}),
      status: 'pending',
      roles: [],
    },
    overrideAccess: true,
    req,
  })

  return { ok: true, id: created.id }
}
