import type { PayloadRequest } from 'payload'

import { renderEmail } from './renderEmail'

/**
 * Branded email bodies for the public-site MEMBER auth flows (Task 4B). Built on
 * the shared `renderEmail` shell, mirroring the admin `authEmails.ts`. The member
 * password-reset link points at the PUBLIC-site reset page
 * (`/reset-password/<token>`), NOT the admin `/admin/reset/<token>` — members
 * never touch the back-office.
 */

/**
 * Server origin for absolute links. SECURITY (CWE-640, same rationale as
 * `authEmails.ts`): trusts ONLY `config.serverURL` (server-set), never the
 * caller-controllable request `Origin`, so a public `find-password` caller can't
 * poison the host in a reset link mailed to a victim.
 */
function resolveServerURL(req?: Partial<PayloadRequest>): string {
  const fromConfig = req?.payload?.config?.serverURL
  if (fromConfig) {
    return fromConfig.replace(/\/$/, '')
  }
  return (process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '')
}

/**
 * Member password-reset email (wired into `members.auth.forgotPassword`
 * `generateEmailHTML` — Payload passes `{ token, req, user }`). Links to the
 * public member reset page.
 */
export function renderMemberForgotPasswordEmail(args: {
  req?: PayloadRequest
  token?: string
  user?: unknown
}): string {
  const { req, token } = args
  const serverURL = resolveServerURL(req)
  const resetUrl = `${serverURL}/reset-password/${token ?? ''}`

  return renderEmail({
    preheader: 'Reset your Pulse CMS member password.',
    heading: 'Reset your password',
    bodyHtml:
      '<p>We received a request to reset the password for your Pulse CMS member account.</p>' +
      '<p>Click the button below to choose a new password. If you did not request this, you can safely ignore this email — your password will not change.</p>',
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
  })
}

/** Member ID-recovery email — emails the account's login ID (ref 1-3, member variant). */
export function renderMemberFindIdEmail(loginId: string): string {
  return renderEmail({
    preheader: 'Your Pulse CMS member login ID.',
    heading: 'Your login ID',
    bodyHtml:
      '<p>You requested to recover the login ID for your Pulse CMS member account.</p>' +
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
