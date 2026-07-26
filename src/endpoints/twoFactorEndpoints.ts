import type { Endpoint, PayloadRequest } from 'payload'

import { recordAccess } from '../audit/recordAccess'
import { branding } from '../branding'
import {
  buildOtpauthUri,
  buildQrDataUrl,
  generateTotpSecret,
  siteRequiresTwoFactor,
  verifyTotp,
} from '../auth/twoFactor'

/**
 * Authenticated Google-OTP enrolment endpoints (Task 2B Part 2, refs 1-5/1-6),
 * plus a static setup guide. Registered at the config level, so served under:
 *   - `POST /api/2fa/enroll`         — issue the QR + secret (first time only)
 *   - `POST /api/2fa/verify-enroll`  — confirm a code and activate 2FA
 *   - `GET  /api/2fa/guide`          — Google Authenticator install steps
 *
 * ## Secret handling (SECURITY)
 *
 * `users.totpSecret` is `hidden` + field-access `read:false`, so it never
 * appears in any API user response. These handlers are the ONLY place the
 * plaintext secret leaves the server, and only:
 *   - to the enrolling user themselves (never a third party — `req.user.id`
 *     scopes every read/write), and
 *   - only while enrolment is unconfirmed. Once `totpConfirmed` is true, the
 *     secret is never returned again; re-issuing requires an admin reset
 *     (Part 4). This mirrors the legacy "QR shown once at first login".
 * All reads/writes use `overrideAccess` + `showHiddenFields` server-side.
 */

async function readJson(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json?.()) ?? {}
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function unauthorized(): Response {
  return Response.json({ ok: false, message: 'Authentication is required.' }, { status: 401 })
}

/** Loads the caller's own user row including the hidden `totpSecret`. */
async function loadSelf(req: PayloadRequest) {
  // Belt-and-braces (B1): NEVER resolve a non-admin principal's id against the
  // `users` table. Members (Task 4B) share the `payload-token` namespace and the
  // two id sequences collide, so a member's id would findByID an id-colliding
  // admin here. The handlers already gate on `collection === 'users'`; this is a
  // defensive fail-closed guard so a future caller can never bypass it.
  if (req.user?.collection !== 'users') {
    throw new Error('twoFactor: loadSelf requires an authenticated `users` principal')
  }
  return req.payload.findByID({
    collection: 'users',
    id: req.user.id,
    overrideAccess: true,
    showHiddenFields: true,
    req,
  })
}

export const enrollTwoFactorEndpoint: Endpoint = {
  path: '/2fa/enroll',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return unauthorized()
    }
    // B1: these endpoints write TOTP onto the `users` collection by the caller's
    // id. Members (Task 4B) share the `payload-token` namespace and their ids
    // collide with users ids, so a member session must be refused here — else it
    // would enrol/confirm an attacker-controlled secret onto an id-colliding admin.
    if (req.user.collection !== 'users') {
      return unauthorized()
    }

    if (!(await siteRequiresTwoFactor(req.payload, req))) {
      return Response.json(
        { ok: false, message: 'Two-factor authentication is not enabled for this site.' },
        { status: 400 },
      )
    }

    const self = (await loadSelf(req)) as {
      id: number | string
      email?: string
      loginId?: string
      totpConfirmed?: boolean | null
      totpSecret?: string | null
    }

    // Already enrolled — never re-leak the secret. Re-issuing requires an
    // admin reset (Part 4).
    if (self.totpConfirmed) {
      return Response.json(
        {
          ok: true,
          alreadyEnrolled: true,
          message:
            'Two-factor authentication is already set up for your account. Ask an administrator to reset it if you have a new device.',
        },
        { status: 200 },
      )
    }

    // Reuse an in-progress (unconfirmed) secret so reloading the enrolment
    // screen shows a stable QR; otherwise mint a fresh one.
    let secret =
      typeof self.totpSecret === 'string' && self.totpSecret.length > 0 ? self.totpSecret : ''
    if (!secret) {
      secret = generateTotpSecret()
      await req.payload.update({
        collection: 'users',
        id: self.id,
        data: { totpSecret: secret },
        overrideAccess: true,
        req,
        context: { skipAudit: true },
      })
    }

    const accountName =
      (typeof self.loginId === 'string' && self.loginId) ||
      (typeof self.email === 'string' && self.email) ||
      String(self.id)
    const otpauthUri = buildOtpauthUri(accountName, secret)
    const qrDataUrl = await buildQrDataUrl(otpauthUri)

    return Response.json(
      {
        ok: true,
        secret,
        otpauthUri,
        qrDataUrl,
        message:
          'Scan this QR code with Google Authenticator (or any TOTP app), then enter the 6-digit code to finish setup.',
      },
      { status: 200 },
    )
  },
}

export const verifyEnrollTwoFactorEndpoint: Endpoint = {
  path: '/2fa/verify-enroll',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return unauthorized()
    }
    // B1: refuse a non-`users` principal (e.g. a Task-4B member) — its id would
    // collide with an admin's in the `users` table and confirm TOTP onto that
    // admin. See the enroll handler + `loadSelf` for the full rationale.
    if (req.user.collection !== 'users') {
      return unauthorized()
    }

    const body = await readJson(req)
    const token = typeof body.token === 'string' ? body.token : ''

    const self = (await loadSelf(req)) as {
      id: number | string
      totpConfirmed?: boolean | null
      totpSecret?: string | null
    }

    if (self.totpConfirmed) {
      return Response.json(
        { ok: false, message: 'Two-factor authentication is already confirmed.' },
        { status: 400 },
      )
    }
    if (typeof self.totpSecret !== 'string' || self.totpSecret.length === 0) {
      return Response.json(
        { ok: false, message: 'No enrolment in progress — request a QR code first.' },
        { status: 400 },
      )
    }
    if (!verifyTotp(token, self.totpSecret)) {
      return Response.json(
        {
          ok: false,
          message: 'That code is not valid. Check your authenticator app and try again.',
        },
        { status: 400 },
      )
    }

    await req.payload.update({
      collection: 'users',
      id: self.id,
      data: { totpConfirmed: true, totpEnrolledAt: new Date().toISOString() },
      overrideAccess: true,
      req,
      context: { skipAudit: true },
    })

    await recordAccess(req.payload, {
      req,
      action: 'update',
      actor: req.user,
      // Acting on the caller's own user row — identity via actorLabel only
      // (see the linkActor deadlock note in recordAccess.ts).
      linkActor: false,
      menuLabel: '2FA enrollment confirmed',
      url: req?.pathname,
    })

    return Response.json(
      { ok: true, message: 'Two-factor authentication is now active on your account.' },
      { status: 200 },
    )
  },
}

const GUIDE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Set up two-factor authentication — ${branding.productName}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; color: #18181b; line-height: 1.6; }
      h1 { font-size: 1.5rem; }
      ol { padding-left: 1.2rem; }
      code { background: #f4f4f5; padding: 1px 5px; border-radius: 4px; }
      .brand { color: ${branding.colors.primary}; font-weight: 600; }
    </style>
  </head>
  <body>
    <h1><span class="brand">${branding.productName}</span> — Set up two-factor authentication</h1>
    <p>Two-factor authentication adds a one-time 6-digit code to your login. You will need a TOTP authenticator app on your phone.</p>
    <ol>
      <li>Install <strong>Google Authenticator</strong> (or Microsoft Authenticator / 1Password / Authy) from the App Store or Google Play.</li>
      <li>On the ${branding.productName} enrolment screen, a QR code is shown <strong>once</strong>. Open your authenticator app and tap <em>Scan a QR code</em>.</li>
      <li>Point your camera at the QR code. A new entry named <code>${branding.productName}</code> appears with a rotating 6-digit code.</li>
      <li>Enter the current 6-digit code back on the enrolment screen to confirm. The code changes every 30 seconds.</li>
      <li>From now on, sign in with your password and then the current 6-digit code from the app.</li>
    </ol>
    <p>If you lose your device, ask an administrator to reset your two-factor authentication so you can enrol a new one.</p>
  </body>
</html>`

export const twoFactorGuideEndpoint: Endpoint = {
  path: '/2fa/guide',
  method: 'get',
  handler: () =>
    new Response(GUIDE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
}

export const twoFactorEndpoints: Endpoint[] = [
  enrollTwoFactorEndpoint,
  verifyEnrollTwoFactorEndpoint,
  twoFactorGuideEndpoint,
]
