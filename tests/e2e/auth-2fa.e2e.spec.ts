import { expect, request as apiRequest, test, type APIRequestContext } from '@playwright/test'

import { getAdminToken, jsonAuth } from './helpers/api'
import { loginAsAdmin, loginAsAdminWithBadOtp, logoutAdmin, totpFor } from './helpers/auth'
import { E2E_ADMIN_PASSWORD, E2E_SUPER } from './helpers/credentials'
import { readFixtures } from './helpers/fixtures'

/**
 * Suite 1 — Authenticated admin auth + 2FA (Task 7C, TODO 7.1; hardened in 7D).
 *
 * This is the ONE suite that runs with the back-office 2FA turned ON — every
 * other authenticated suite runs under the demo-default 2FA-OFF posture, where
 * the Task 7D (P1) confinement is inert and admin login is password-only (the
 * `require2FA` gate returns early when no site requires 2FA). So this suite owns
 * enabling 2FA in `beforeAll` and restoring the OFF posture in `afterAll`, and
 * it drives the REAL two-step password→Google-OTP login for the enrolled
 * `e2e-super` (secret in `.fixtures.json`, captured by the setup project):
 *  - correct OTP → dashboard; wrong OTP → rejected, correct one recovers; logout;
 *  - Task 7D (P1): an UN-ENROLLED admin under a 2FA-required back-office gets a
 *    CONFINED session — denied normal admin data ops server-side (even as a
 *    super), yet still able to reach the `/api/2fa/*` enrolment surface, so the
 *    2FA mandate stays completable. This locks P1 at the e2e/live-server level.
 */

let apiCtx: APIRequestContext
let adminToken: string
let bosSiteId: number
let superTotpSecret: string

test.describe('Admin auth + 2FA', () => {
  test.beforeAll(async () => {
    const fx = readFixtures()
    bosSiteId = fx.bosSiteId
    superTotpSecret = fx.superTotpSecret
    apiCtx = await apiRequest.newContext({ baseURL: 'http://localhost:3000' })
    // 2FA is OFF entering this suite (setup posture) → e2e-super logs in
    // password-only; this session stays valid across the toggle for afterAll.
    adminToken = await getAdminToken(apiCtx, {
      email: E2E_SUPER.email,
      password: E2E_SUPER.password,
    })
    const on = await apiCtx.patch(`/api/sites/${bosSiteId}`, {
      headers: jsonAuth(adminToken),
      data: { twoFactorEnabled: true },
    })
    expect(on.ok(), `enable back-office 2FA: ${on.status()}`).toBeTruthy()
  })

  test.afterAll(async () => {
    // Restore the demo-default 2FA-OFF posture for every other suite. e2e-super
    // is enrolled → its beforeAll session is unconfined → allowed to flip it back.
    if (apiCtx && adminToken && bosSiteId) {
      await apiCtx
        .patch(`/api/sites/${bosSiteId}`, {
          headers: jsonAuth(adminToken),
          data: { twoFactorEnabled: false },
        })
        .catch(() => undefined)
    }
    await apiCtx?.dispose()
  })

  test('password → correct OTP logs in and lands on the dashboard', async ({ page }) => {
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })

    await expect(page).toHaveURL(/\/admin(\/|$|\?)/)
    await expect(page).toHaveTitle(/Dashboard — U-CMS/)
    // The permission-filtered dashboard greets the signed-in admin.
    await expect(page.locator('body')).toContainText('Welcome back')

    await logoutAdmin(page)
  })

  test('a wrong OTP is rejected on the OTP step; a correct OTP then recovers', async ({ page }) => {
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
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })
    await logoutAdmin(page)
    // logoutAdmin already asserts /admin bounces to the login form.
  })

  test('P1: an un-enrolled admin under 2FA-on is confined — denied admin data ops, but can reach 2FA enrolment', async ({
    request,
    page,
  }) => {
    // Create a throwaway admin via the enrolled e2e-super (unconfined). Give it a
    // SUPER role so the denial is unambiguous: a super would normally see/write
    // everything, so a denial is the confinement, not a missing grant.
    const suffix = Date.now()
    const roleRes = await apiCtx.post('/api/roles', {
      headers: jsonAuth(adminToken),
      data: {
        roleId: `ROLE_E2E_CONF_${suffix}`,
        name: `conf ${suffix}`,
        description: 'e2e confinement probe',
        isSuper: true,
      },
    })
    expect(roleRes.ok(), `create probe role: ${roleRes.status()}`).toBeTruthy()
    const roleId = ((await roleRes.json()) as { doc: { id: number } }).doc.id

    const email = `e2e-confined-${suffix}@admin.example.com`
    const userRes = await apiCtx.post('/api/users', {
      headers: jsonAuth(adminToken),
      data: {
        email,
        loginId: `e2econf${suffix}`,
        name: 'conf probe',
        password: E2E_ADMIN_PASSWORD,
        status: 'active',
        roles: [roleId],
      },
    })
    expect(userRes.ok(), `create probe admin: ${userRes.status()}`).toBeTruthy()

    // Log in as the un-enrolled admin: require2FA lets it through with no OTP, so
    // the session EXISTS — but it is CONFINED at the access layer.
    const confinedToken = await getAdminToken(request, { email, password: E2E_ADMIN_PASSWORD })

    // DENIED normal admin data ops even though the role isSuper. Denial shows as
    // either a Forbidden status or an empty result set (a super would otherwise
    // see every role) — assert "sees no admin data" robustly across both.
    const listRoles = await request.get('/api/roles?limit=5', { headers: jsonAuth(confinedToken) })
    let rolesVisible = 0
    if (listRoles.ok()) {
      rolesVisible = (((await listRoles.json()) as { docs?: unknown[] }).docs ?? []).length
    }
    expect(rolesVisible, 'confined admin sees no roles').toBe(0)

    const createDept = await request.post('/api/departments', {
      headers: jsonAuth(confinedToken),
      data: { name: `confdept${suffix}` },
    })
    expect(createDept.ok(), 'confined create must be denied').toBeFalsy()

    // CAN reach the 2FA enrolment surface (the /api/2fa endpoints use overrideAccess):
    const enroll = await request.post('/api/2fa/enroll', { headers: jsonAuth(confinedToken) })
    expect(
      enroll.ok(),
      `2FA enroll must be reachable while confined: ${enroll.status()}`,
    ).toBeTruthy()
    expect(
      ((await enroll.json()) as { secret?: string }).secret,
      'enrol returns a secret',
    ).toBeTruthy()

    // Browser flavor: the confined admin still gets a real session (lands in
    // /admin with no OTP step) — proving P1 is server-side DATA gating, not a
    // login block that would make enrolment impossible.
    await loginAsAdmin(page, { email, password: E2E_ADMIN_PASSWORD })
    await expect(page).toHaveURL(/\/admin(\/|$|\?)/)
  })
})
