import { authenticator } from 'otplib'
import { expect, type Page } from '@playwright/test'

/**
 * Reusable login helpers (Task 7C) — the harness the earlier phases lacked, which
 * is why every prior e2e only asserted the anonymous/gated posture.
 *
 * `loginAsAdmin` drives the REAL two-step branded admin form
 * (`src/components/login/LoginForm.tsx`): step 1 posts `{email,password}`, and
 * the server's `require2FA` gate either lets the login through (2FA off / not
 * enrolled — the "no-OTP path") or asks for the 6-digit code, which the form
 * reveals as `#field-otp`. The helper detects which path happened and, when the
 * OTP step appears, computes a valid code from the shared secret with
 * `otplib.authenticator.generate` (the same code the server's `verifyTotp`
 * accepts). So the ONE helper works whether or not 2FA is enabled — the e2e
 * global-setup turns it ON + enrols the admins, so in this suite the OTP path is
 * the one exercised.
 *
 * `loginAsMember` drives the PUBLIC-site login (`/login`) — members never have
 * 2FA.
 *
 * The e2e setup project turns the back-office 2FA ON and enrols `e2e-super`
 * (secret in `.fixtures.json`), so that account exercises the OTP path; the
 * other e2e admins are left un-enrolled and exercise the no-OTP path — the ONE
 * helper handles both by detecting whether the OTP step appears.
 */

/** Generates the current 6-digit TOTP for a base32 secret (server-verified ±1 step). */
export function totpFor(secret: string): string {
  return authenticator.generate(secret)
}

type AdminCreds = { email: string; password: string; totpSecret?: string }

/**
 * Logs in to `/admin` as an admin `user`, handling BOTH the OTP and no-OTP
 * paths. Resolves once the admin panel has loaded (URL left `/admin/login`).
 */
export async function loginAsAdmin(page: Page, creds: AdminCreds): Promise<void> {
  await page.goto('/admin/login')
  await page.locator('#field-email').fill(creds.email)
  await page.locator('#field-password').fill(creds.password)
  await page.locator('button[type="submit"]').click()

  // The form is client-side: on success it navigates away; on "OTP required" it
  // reveals #field-otp without navigating. Wait for whichever happened.
  await page.waitForFunction(
    () => {
      const otp = document.querySelector('#field-otp') as HTMLElement | null
      const onLogin = location.pathname.includes('/admin/login')
      return (otp && otp.offsetParent !== null) || !onLogin
    },
    { timeout: 20000 },
  )

  if (await page.locator('#field-otp').isVisible()) {
    if (!creds.totpSecret) {
      throw new Error(
        `loginAsAdmin: OTP required for ${creds.email} but no totpSecret was provided`,
      )
    }
    await page.locator('#field-otp').fill(totpFor(creds.totpSecret))
    await page.locator('button[type="submit"]').click()
  }

  // Landed in the admin panel (dashboard or wherever redirectTo pointed).
  await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 20000 })
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/)
}

/**
 * Attempts an admin login with a DELIBERATELY WRONG OTP and asserts it is
 * rejected: the form stays on the OTP step and surfaces the invalid-code error.
 * (Requires 2FA to be enabled + the admin enrolled — the e2e global-setup does
 * both.)
 */
export async function loginAsAdminWithBadOtp(
  page: Page,
  creds: { email: string; password: string },
  badOtp = '000000',
): Promise<void> {
  await page.goto('/admin/login')
  await page.locator('#field-email').fill(creds.email)
  await page.locator('#field-password').fill(creds.password)
  await page.locator('button[type="submit"]').click()
  await page.locator('#field-otp').waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('#field-otp').fill(badOtp)
  await page.locator('button[type="submit"]').click()
}

/**
 * Logs in to `/admin` with a password-only admin who has NOT yet enrolled a
 * 2FA device on a site that requires it, and waits for the client-side
 * enrolment screen (`LoginForm.tsx`'s `'enroll'` step) to appear — i.e. drives
 * the real browser flow described in `task-audit-fix1-brief.md` rather than
 * calling `/api/2fa/enroll` directly. Returns the TOTP secret rendered in the
 * `#enroll-secret` fallback `<code>` block, which the caller can feed to
 * `totpFor` to compute a valid code the same way a real authenticator app
 * would.
 */
export async function loginAsAdminUntilEnrollStep(
  page: Page,
  creds: { email: string; password: string },
): Promise<string> {
  await page.goto('/admin/login')
  await page.locator('#field-email').fill(creds.email)
  await page.locator('#field-password').fill(creds.password)
  await page.locator('button[type="submit"]').click()

  await page.locator('#enroll-secret').waitFor({ state: 'visible', timeout: 20000 })
  const secret = (await page.locator('#enroll-secret').textContent())?.trim()
  if (!secret) {
    throw new Error('loginAsAdminUntilEnrollStep: enrolment secret not found on the page')
  }
  return secret
}

/** Fills and submits the 6-digit code on the enrolment screen's `#field-enroll-code` input. */
export async function submitEnrollCode(page: Page, code: string): Promise<void> {
  await page.locator('#field-enroll-code').fill(code)
  await page.locator('button[type="submit"]').click()
}

/** Logs out of the admin panel and asserts the login form is shown again. */
export async function logoutAdmin(page: Page): Promise<void> {
  await page.goto('/admin/logout')
  await page.waitForURL(/\/admin\/(login|logout)/, { timeout: 20000 })
  // A subsequent hit to a gated route bounces to login (proves the session is gone).
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
  await expect(page.locator('#field-email')).toBeVisible()
}

type MemberCreds = { identifier: string; password: string }

/** Logs in on the PUBLIC site as a member; resolves on the profile page. */
export async function loginAsMember(page: Page, creds: MemberCreds): Promise<void> {
  await page.goto('/login')
  await page.locator('#identifier').fill(creds.identifier)
  await page.locator('#password').fill(creds.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/profile/, { timeout: 20000 })
}
