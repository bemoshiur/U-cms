/**
 * Smoke-tests the nodemailer email adapter end-to-end.
 *
 * Sends one email through Payload's configured email adapter (nodemailer,
 * pointed at Mailpit in dev) using the branded `renderEmail` template, then
 * confirms delivery by querying the Mailpit REST API for a message with a
 * matching subject.
 *
 * Prereqs:
 *   - `docker compose up -d mailpit` (or the full stack)
 *   - A valid `DATABASE_URI` / `PAYLOAD_SECRET` in the environment
 *
 * Usage:
 *   pnpm tsx scripts/smoke-email.ts
 */
import 'dotenv/config'

import { getPayload } from 'payload'

import { branding } from '../src/branding'
import { renderEmail } from '../src/email/renderEmail'
import config from '../src/payload.config'

const mailpitApiUrl = process.env.MAILPIT_API_URL || 'http://localhost:8025'

type MailpitMessage = {
  Subject: string
}

type MailpitMessagesResponse = {
  messages: MailpitMessage[]
}

async function main() {
  const payload = await getPayload({ config })

  const subject = `${branding.productName} smoke test — ${new Date().toISOString()}`
  const html = renderEmail({
    preheader: 'This is an automated smoke test email.',
    heading: 'Smoke test email',
    bodyHtml:
      '<p>This message confirms the nodemailer adapter can reach the configured SMTP server.</p>',
    ctaLabel: 'Open admin',
    ctaUrl: 'http://localhost:3000/admin',
  })

  await payload.sendEmail({
    to: branding.supportEmail,
    subject,
    html,
  })

  payload.logger.info(`Sent email with subject: ${subject}`)

  const found = await pollForMessage(subject)

  if (!found) {
    throw new Error(
      `Email with subject "${subject}" was not found in Mailpit at ${mailpitApiUrl}. ` +
        'Is Mailpit running (`docker compose up -d mailpit`)?',
    )
  }

  payload.logger.info(`Verified: email arrived in Mailpit (${mailpitApiUrl}).`)
  process.exit(0)
}

async function pollForMessage(subject: string, attempts = 10, delayMs = 500): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await fetch(`${mailpitApiUrl}/api/v1/messages`)
    if (!res.ok) {
      throw new Error(`Failed to query Mailpit API: ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as MailpitMessagesResponse
    if (data.messages?.some((message) => message.Subject === subject)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return false
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
