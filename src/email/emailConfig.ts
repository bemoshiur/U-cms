import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import type { EmailAdapter } from 'payload'

import { branding } from '../branding'

/**
 * Email transport posture (Task TR2 Part 3).
 *
 * ## The rule (and the protection intent it preserves)
 *
 * The original Phase-1 I-2 guard THREW at boot when `NODE_ENV=production` and
 * `SMTP_HOST` was unset, so a production deploy could never silently relay
 * through the dev-only Mailpit (`localhost:1025`) and only discover it at send
 * time. That protection intent is KEPT — prod still never falls back to
 * localhost. What changes is the failure mode: instead of 500-ing the whole
 * app (which bricks a bare Vercel demo that legitimately has no SMTP yet),
 * production-without-SMTP now DISABLES email — a loud one-time warning plus a
 * no-op transport that LOGS each would-be send instead of delivering it. Email
 * features (password-reset, notify) degrade gracefully rather than taking the
 * whole deployment down.
 *
 *   - prod + `SMTP_HOST` set     → real SMTP transport (unchanged).
 *   - prod + `SMTP_HOST` unset   → email DISABLED (no-op logging transport, warn).
 *                                   NEVER localhost in prod (original intent).
 *   - dev / build phase          → Mailpit (`SMTP_HOST` || localhost), unchanged.
 *
 * The partial-auth guard (only one of `SMTP_USER`/`SMTP_PASS`) still THROWS —
 * that is a genuine misconfiguration, orthogonal to whether SMTP is present.
 */

/**
 * `next build` always runs with `NODE_ENV=production` (Next signals its own
 * build optimizations that way), but Payload's config is evaluated during the
 * build too — long before any SMTP config is relevant. Next sets
 * `NEXT_PHASE=phase-production-build` for the duration of `next build` only, so
 * we treat the build phase as NON-production for the SMTP decision (it uses the
 * dev/Mailpit branch and never disables). See the original note in
 * payload.config.ts.
 */
function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'production' && env.NEXT_PHASE !== 'phase-production-build'
}

/**
 * Validates and returns the SMTP port. Mirrors the fail-fast posture of the S3
 * gate: an invalid value throws rather than silently coercing. Unset/empty (the
 * expected dev state) resolves to Mailpit's default port; `"0"` is an explicit
 * invalid value, not "unset".
 */
export function getSmtpPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SMTP_PORT
  if (raw === undefined || raw === '') {
    return 1025
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`SMTP_PORT must be a positive integer if set; received: "${raw}"`)
  }
  return parsed
}

export type SmtpAuth = { user: string; pass: string }

export type EmailPosture =
  | {
      mode: 'transport'
      host: string
      port: number
      secure: boolean
      auth?: SmtpAuth
    }
  | { mode: 'disabled' }

/**
 * Pure, fully unit-testable decision — no side effects, no network. Given the
 * environment, returns either a `transport` posture (with the resolved host/
 * port/secure/auth) or `disabled` (prod without SMTP).
 */
export function resolveEmailPosture(env: NodeJS.ProcessEnv = process.env): EmailPosture {
  const smtpHost = env.SMTP_HOST
  const smtpUser = env.SMTP_USER
  const smtpPass = env.SMTP_PASS

  // Partial auth is always a misconfiguration — throw (unchanged intent).
  if ((smtpUser && !smtpPass) || (!smtpUser && smtpPass)) {
    throw new Error(
      'SMTP_USER and SMTP_PASS must both be set together, or both left unset — refusing to silently drop SMTP auth.',
    )
  }

  // Production runtime without SMTP → email disabled (never localhost in prod).
  if (isProductionRuntime(env) && !smtpHost) {
    return { mode: 'disabled' }
  }

  const auth = smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
  return {
    mode: 'transport',
    // dev/build: fall back to Mailpit's localhost relay. prod: `smtpHost` is set
    // (the disabled branch above already caught prod-without-host).
    host: smtpHost || 'localhost',
    port: getSmtpPort(env),
    secure: env.SMTP_SECURE === 'true',
    ...(auth ? { auth } : {}),
  }
}

let warnedDisabledOnce = false

/** Loud, one-time boot warning that email delivery is disabled in production. */
function warnEmailDisabledOnce(): void {
  if (warnedDisabledOnce) {
    return
  }
  warnedDisabledOnce = true
  // Config-load time — payload.logger isn't available yet, so use console.
  console.warn(
    '[email] SMTP is NOT configured in production — email delivery is DISABLED. ' +
      'Password-reset / notification emails will be LOGGED, not sent. ' +
      'Set SMTP_HOST (and SMTP_PORT/SMTP_USER/SMTP_PASS) to enable delivery.',
  )
}

/**
 * No-op email adapter used when email is disabled in production. It never
 * connects anywhere; every `sendEmail` is logged via `payload.logger` (so the
 * would-be recipient/subject is visible in server logs) and resolves as a
 * skipped send. This is what lets the app boot + serve without SMTP while
 * making it obvious in logs that mail is not going out.
 */
export function createDisabledEmailAdapter(env: NodeJS.ProcessEnv = process.env): EmailAdapter {
  return ({ payload }) => ({
    name: 'noop-disabled',
    defaultFromAddress: env.EMAIL_FROM_ADDRESS || branding.supportEmail,
    defaultFromName: env.EMAIL_FROM_NAME || branding.productName,
    sendEmail: async (message) => {
      payload.logger.warn(
        { to: message.to, subject: message.subject },
        '[email] SMTP not configured (production) — email DISABLED: this message was logged, not sent.',
      )
      return { skipped: true, reason: 'smtp-not-configured' }
    },
  })
}

/**
 * Builds the Payload email adapter for the current environment. Returns a
 * promise so the two branches (async nodemailer init vs. sync no-op) share one
 * type; Payload accepts a `Promise<EmailAdapter>` for `config.email`.
 */
export function buildEmailAdapter(env: NodeJS.ProcessEnv = process.env): Promise<EmailAdapter> {
  const posture = resolveEmailPosture(env)

  if (posture.mode === 'disabled') {
    warnEmailDisabledOnce()
    return Promise.resolve(createDisabledEmailAdapter(env))
  }

  return nodemailerAdapter({
    defaultFromAddress: env.EMAIL_FROM_ADDRESS || branding.supportEmail,
    defaultFromName: env.EMAIL_FROM_NAME || branding.productName,
    transportOptions: {
      host: posture.host,
      port: posture.port,
      secure: posture.secure,
      ...(posture.auth ? { auth: posture.auth } : {}),
    },
  })
}
