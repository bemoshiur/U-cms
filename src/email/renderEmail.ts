import { branding } from '../branding'

export type RenderEmailOptions = {
  /** Short preview text shown next to the subject line in most email clients. */
  preheader?: string
  /** Main heading shown at the top of the email body. */
  heading: string
  /** Body content, as raw HTML (e.g. `<p>...</p>`). Not escaped — caller is responsible for sanitizing. */
  bodyHtml: string
  /** Label for the optional call-to-action button. Requires `ctaUrl`. */
  ctaLabel?: string
  /** URL for the optional call-to-action button. Requires `ctaLabel`. */
  ctaUrl?: string
}

/**
 * Renders a minimal, email-client-safe HTML shell branded with Pulse CMS's
 * product identity (`src/branding.ts`).
 *
 * Uses inline styles and a table-based layout (no external CSS, no flex/grid)
 * so it renders consistently across Outlook, Gmail, Apple Mail, etc. Capped
 * at 600px wide, the common safe max-width for email.
 *
 * @example
 * ```ts
 * import { renderEmail } from './src/email/renderEmail'
 *
 * const html = renderEmail({
 *   preheader: 'Confirm your email address to finish setting up your account.',
 *   heading: 'Confirm your email',
 *   bodyHtml: '<p>Click the button below to verify your email address.</p>',
 *   ctaLabel: 'Verify email',
 *   ctaUrl: 'https://example.com/verify?token=abc123',
 * })
 *
 * await payload.sendEmail({ to: 'user@example.com', subject: 'Confirm your email', html })
 * ```
 */
export function renderEmail({
  preheader,
  heading,
  bodyHtml,
  ctaLabel,
  ctaUrl,
}: RenderEmailOptions): string {
  const showCta = Boolean(ctaLabel && ctaUrl)
  const year = new Date().getFullYear()

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f5; -webkit-text-size-adjust:100%; text-size-adjust:100%;">
    ${
      preheader
        ? `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f4f4f5;">${escapeHtml(preheader)}</div>`
        : ''
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background-color:${branding.colors.primary}; padding:20px 32px;">
                <span style="font-family:Helvetica, Arial, sans-serif; font-size:18px; font-weight:bold; color:#ffffff;">${escapeHtml(branding.productName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px; font-family:Helvetica, Arial, sans-serif; color:#18181b;">
                <h1 style="margin:0 0 16px; font-size:20px; line-height:28px; color:#18181b;">${escapeHtml(heading)}</h1>
                <div style="font-size:15px; line-height:24px; color:#3f3f46;">${bodyHtml}</div>
                ${
                  showCta
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                  <tr>
                    <td align="center" style="border-radius:6px; background-color:${branding.colors.primary};">
                      <a href="${escapeAttr(ctaUrl as string)}" target="_blank" style="display:inline-block; padding:12px 24px; font-family:Helvetica, Arial, sans-serif; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:6px;">${escapeHtml(ctaLabel as string)}</a>
                    </td>
                  </tr>
                </table>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px; background-color:#f4f4f5; font-family:Helvetica, Arial, sans-serif; font-size:12px; line-height:18px; color:#71717a;">
                ${escapeHtml(branding.companyName)} &middot; <a href="mailto:${escapeAttr(branding.supportEmail)}" style="color:#71717a;">${escapeHtml(branding.supportEmail)}</a>
                <br />
                &copy; ${year} ${escapeHtml(branding.companyName)}. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value)
}
