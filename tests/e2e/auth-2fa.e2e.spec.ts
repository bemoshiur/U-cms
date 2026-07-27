import { expect, test } from '@playwright/test'

import { loginAsAdmin, loginAsAdminWithBadOtp, logoutAdmin, totpFor } from './helpers/auth'
import { E2E_SUPER } from './helpers/credentials'
import { readFixtures } from './helpers/fixtures'

/**
 * Suite 1 — Authenticated admin auth + 2FA (Task 7C, TODO 7.1).
 *
 * The back-office 2FA is turned ON and `e2e-super` is enrolled with a known
 * secret by the setup project (see helpers/apiSetup.ts), so these drive the REAL
 * two-step password→Google-OTP login end-to-end: a correct OTP lands on the
 * dashboard, a wrong OTP is rejected (and a correct one then recovers), and
 * logout returns to the gated login. Member signup→login→profile is covered by
 * `member-auth.e2e.spec.ts`.
 */
test.describe('Admin auth + 2FA', () => {
  test('password → correct OTP logs in and lands on the dashboard', async ({ page }) => {
    const { superTotpSecret } = readFixtures()
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })

    await expect(page).toHaveURL(/\/admin(\/|$|\?)/)
    await expect(page).toHaveTitle(/Dashboard — U-CMS/)
    // The permission-filtered dashboard greets the signed-in admin.
    await expect(page.locator('body')).toContainText('Welcome back')

    await logoutAdmin(page)
  })

  test('a wrong OTP is rejected on the OTP step; a correct OTP then recovers', async ({ page }) => {
    const { superTotpSecret } = readFixtures()

    // Password step → OTP step → WRONG code.
    await loginAsAdminWithBadOtp(page, E2E_SUPER, '000000')

    // Still on the login page, still on the OTP step, with the invalid-code error —
    // never let into the admin.
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.locator('#field-otp')).toBeVisible()
    await expect(page.getByText(/that code is not valid/i)).toBeVisible()

    // A correct code from the same step now succeeds — proves the wrong attempt
    // did not consume the session and the throttle counter is cleared on success.
    await page.locator('#field-otp').fill(totpFor(superTotpSecret))
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 20000 })
    await expect(page).toHaveTitle(/Dashboard — U-CMS/)

    await logoutAdmin(page)
  })

  test('logout ends the admin session (a gated route bounces to login)', async ({ page }) => {
    const { superTotpSecret } = readFixtures()
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })
    await logoutAdmin(page)
    // logoutAdmin already asserts /admin bounces to the login form.
  })
})
