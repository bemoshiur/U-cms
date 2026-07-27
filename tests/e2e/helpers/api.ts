import { authenticator } from 'otplib'
import type { APIRequestContext } from '@playwright/test'

/**
 * Obtains an admin JWT via the REST login (Task 7C). Used with the Playwright
 * `request` fixture + an explicit `Authorization: JWT <token>` header for
 * authenticated API calls, because a browser `page.request` does NOT reliably
 * carry the cookie the custom client login sets. Handles the OTP step for an
 * enrolled admin (pass `totpSecret`); an un-enrolled admin logs in in one step.
 */
export async function getAdminToken(
  request: APIRequestContext,
  creds: { email: string; password: string; totpSecret?: string },
): Promise<string> {
  const headers = { 'Content-Type': 'application/json' }
  const first = await request.post('/api/users/login', {
    data: { email: creds.email, password: creds.password },
    headers,
  })
  const firstBody = (await first.json().catch(() => ({}))) as { token?: string }
  if (firstBody.token) {
    return firstBody.token
  }
  if (!creds.totpSecret) {
    throw new Error(`getAdminToken: login for ${creds.email} needs an OTP but no secret was given`)
  }
  const second = await request.post('/api/users/login', {
    data: {
      email: creds.email,
      password: creds.password,
      otp: authenticator.generate(creds.totpSecret),
    },
    headers,
  })
  const secondBody = (await second.json().catch(() => ({}))) as { token?: string }
  if (!secondBody.token) {
    throw new Error(`getAdminToken: OTP login failed for ${creds.email}: ${second.status()}`)
  }
  return secondBody.token
}

/** Auth headers for a JSON request carrying an admin JWT. */
export function jsonAuth(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }
}
