import type { PayloadRequest } from 'payload'

import { renderEmail } from './renderEmail'

/**
 * Branded email bodies for the admin-account auth flows (Task 1D). All build
 * on the shared `renderEmail` shell (`src/email/renderEmail.ts`).
 */

/** Derives the server origin for building absolute links in emails. */
function resolveServerURL(req?: Partial<PayloadRequest>): string {
  const fromConfig = req?.payload?.config?.serverURL
  if (fromConfig) {
    return fromConfig.replace(/\/$/, '')
  }
  const origin = req?.headers?.get?.('origin')
  if (origin) {
    return origin.replace(/\/$/, '')
  }
  return (process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '')
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
    preheader: 'Reset your Pulse CMS administrator password.',
    heading: 'Reset your password',
    bodyHtml:
      '<p>We received a request to reset the password for your Pulse CMS administrator account.</p>' +
      '<p>Click the button below to choose a new password. If you did not request this, you can safely ignore this email — your password will not change.</p>',
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
  })
}

/** ID-recovery email HTML (ref 1-3 Find ID → email the account's login ID). */
export function renderFindIdEmail(loginId: string): string {
  return renderEmail({
    preheader: 'Your Pulse CMS administrator login ID.',
    heading: 'Your login ID',
    bodyHtml:
      '<p>You requested to recover the login ID for your Pulse CMS administrator account.</p>' +
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
