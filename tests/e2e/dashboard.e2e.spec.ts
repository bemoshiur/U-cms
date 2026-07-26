import { expect, test } from '@playwright/test'

/**
 * Task 5D — the custom permission-filtered dashboard replaces the `/admin`
 * landing view (`admin.components.views.dashboard`). Like the other Phase-5
 * custom views, this repo has no authenticated-admin e2e (admin login is a
 * two-step password → Google-OTP flow), so this asserts the UNAUTHENTICATED
 * posture: overriding the dashboard did NOT break the admin root, and an
 * anonymous visitor is bounced to the login form and sees NO dashboard content.
 *
 * The dashboard's DATA correctness (per-widget permission filtering, tenant
 * scoping, secret-post exclusion, today's-metrics counts) is covered by
 * `tests/int/dashboard.int.spec.ts` over the `loadDashboardData` read-side, and
 * the widget-selection logic by `tests/unit/dashboard.spec.ts`.
 */
test.describe('Admin dashboard (/admin landing)', () => {
  test('the /admin root still resolves + is branded after the dashboard override', async ({
    page,
  }) => {
    const response = await page.goto('/admin')
    expect(response?.status()).toBeLessThan(500)
    await expect(page).toHaveTitle(/U-CMS/)
  })

  test('an anonymous visitor is gated to login and sees NO dashboard widgets', async ({ page }) => {
    await page.goto('/admin')

    // Anonymous → the auth form (login or create-first-user), never the dashboard.
    await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
    await expect(page.locator('#field-email')).toBeVisible()

    // CRUCIALLY, none of the dashboard's widget chrome leaks to an anon visitor.
    const body = page.locator('body')
    await expect(body).not.toContainText('Welcome back')
    await expect(body).not.toContainText('Recent Posts & Q&A')
    await expect(body).not.toContainText('System Errors')
  })
})
