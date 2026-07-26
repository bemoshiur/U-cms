import type { PayloadRequest } from 'payload'

import { branding } from '../branding'
import { resolvePublicServerURL } from '../env/serverUrl'
import { renderEmail } from './renderEmail'

/**
 * Branded email bodies for the admin-account auth flows (Task 1D). All build
 * on the shared `renderEmail` shell (`src/email/renderEmail.ts`).
 */

/**
 * Derives the server origin for building absolute links in emails.
 *
 * SECURITY (CWE-640 host/reset-link poisoning — see
 * `.superpowers/sdd/TODO/phase1-final-review.md` I-1): this deliberately
 * does NOT consult the request's `Origin` header. `req` is the *caller's*
 * request — Payload passes it straight into `generateEmailHTML` (see
 * `payload/dist/auth/operations/forgotPassword.js`) — so an `Origin`
 * fallback here would let an unauthenticated caller of the public
 * `POST /api/find-password` endpoint choose the host embedded in a
 * password-reset link sent to a victim's inbox. `config.serverURL` (set
 * explicitly in `src/payload.config.ts` from `PAYLOAD_PUBLIC_SERVER_URL`)
 * is the only trusted, server-controlled source of truth; the final
 * fallback below is for the rare case `req.payload` isn't populated and is
 * itself server-side config, never request-derived (resolved via the shared
 * `resolvePublicServerURL`, so it matches payload.config's authoritative
 * `serverURL` — incl. the Vercel-host fallback).
 */
function resolveServerURL(req?: Partial<PayloadRequest>): string {
  const fromConfig = req?.payload?.config?.serverURL
  if (fromConfig) {
    return fromConfig.replace(/\/$/, '')
  }
  return resolvePublicServerURL()
}

/**
 * Password-reset email HTML (wired into `users.auth.forgotPassword`
 * `generateEmailHTML` — Payload passes `{ token, req, user }`). Links to
 * Payload's built-in admin reset page (`/admin/reset/<token>`).
 */
export function renderForgotPasswordEmail(args: {
  req?: PayloadRequest
  token?: string
  user?: unknown
}): string {
  const { req, token } = args
  const serverURL = resolveServerURL(req)
  const resetUrl = `${serverURL}/admin/reset/${token ?? ''}`

  return renderEmail({
    preheader: `Reset your ${branding.productName} administrator password.`,
    heading: 'Reset your password',
    bodyHtml:
      `<p>We received a request to reset the password for your ${branding.productName} administrator account.</p>` +
      '<p>Click the button below to choose a new password. If you did not request this, you can safely ignore this email — your password will not change.</p>',
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
  })
}

/**
 * 2FA reset notice (Task 2B Part 4, ref 1-16). Sent to a user after an admin
 * clears or regenerates their Google-OTP enrolment, so they know their existing
 * authenticator entry no longer works and that they must re-enrol on next login.
 * Deliberately carries NO secret/QR (those are only ever shown in the
 * authenticated enrolment flow, once) — this is purely a heads-up.
 */
export function renderTwoFactorResetEmail(): string {
  return renderEmail({
    preheader: `Your ${branding.productName} two-factor authentication has been reset.`,
    heading: 'Two-factor authentication reset',
    bodyHtml:
      `<p>An administrator has reset the two-factor authentication (Google OTP) on your ${branding.productName} account.</p>` +
      '<p>Your previous authenticator entry will no longer work. The next time you sign in, you will be guided through setting up two-factor authentication again with a new QR code.</p>' +
      '<p>If you did not expect this, please contact an administrator immediately.</p>',
  })
}

/** ID-recovery email HTML (ref 1-3 Find ID → email the account's login ID). */
export function renderFindIdEmail(loginId: string): string {
  return renderEmail({
    preheader: `Your ${branding.productName} administrator login ID.`,
    heading: 'Your login ID',
    bodyHtml:
      `<p>You requested to recover the login ID for your ${branding.productName} administrator account.</p>` +
      `<p>Your login ID is: <strong>${escapeHtml(loginId)}</strong></p>` +
      '<p>If you did not request this, you can safely ignore this email.</p>',
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
