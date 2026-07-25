import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import type { Payload, PayloadRequest } from 'payload'

import { branding } from '../branding'

export {
  TWO_FACTOR_REQUIRED_MESSAGE,
  TWO_FACTOR_INVALID_MESSAGE,
  TWO_FACTOR_ENROLL_REQUIRED_MESSAGE,
} from './twoFactorMessages'

/**
 * Google-OTP (TOTP) two-factor authentication primitives (Task 2B; refs 1-4,
 * 1-5, 1-6). Pure, side-effect-free helpers around `otplib` + `qrcode`, kept
 * separate from the collection hooks (`twoFactorHooks.ts`) and endpoints
 * (`src/endpoints/twoFactorEndpoints.ts`) so the crypto is unit-testable on its
 * own.
 *
 * ## Verification window
 *
 * `window: 1` accepts the previous, current, and next 30-second code — the
 * standard tolerance for clock skew between the server and the user's phone
 * (the brief's "window ±1"). Set once here as module state on the shared
 * `authenticator` singleton; this module is the only place `otplib` is used, so
 * the global mutation is fully contained.
 */
authenticator.options = { window: 1 }

/** The issuer shown in the authenticator app (otpauth `issuer=` + label prefix). */
export const TOTP_ISSUER = branding.productName

/** Generates a fresh base32 TOTP shared secret (server-side only). */
export function generateTotpSecret(): string {
  return authenticator.generateSecret()
}

/**
 * Verifies a 6-digit TOTP `token` against `secret` (±1 time-step window).
 * Never throws — a malformed token or secret resolves to `false` (otplib can
 * throw on non-base32 input).
 */
export function verifyTotp(token: string, secret: string): boolean {
  if (typeof token !== 'string' || typeof secret !== 'string' || token.trim() === '') {
    return false
  }
  try {
    return authenticator.verify({ token: token.trim(), secret })
  } catch {
    return false
  }
}

/**
 * Builds the `otpauth://totp/...` provisioning URI an authenticator app
 * imports. `accountName` is the user's loginId/email (the label shown in the
 * app); the issuer is the product name.
 */
export function buildOtpauthUri(accountName: string, secret: string): string {
  return authenticator.keyuri(accountName, TOTP_ISSUER, secret)
}

/** Renders an `otpauth://` URI to a PNG data-URL for on-screen QR display. */
export function buildQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 })
}

/**
 * True when the admin back-office requires 2FA — i.e. some admin site
 * (`isAdminSite: true`) has `twoFactorEnabled: true`. Mirrors
 * `accountApplicationEnabled` in `src/accounts/accountRequest.ts`: the toggle
 * lives on the admin site row (ref 1-18) and applies to the whole back-office
 * login, so "any admin site has it on" is the effective switch.
 */
export async function siteRequiresTwoFactor(
  payload: Payload,
  req?: PayloadRequest,
): Promise<boolean> {
  const found = await payload.find({
    collection: 'sites',
    where: {
      and: [{ isAdminSite: { equals: true } }, { twoFactorEnabled: { equals: true } }],
    },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return found.docs.length > 0
}
