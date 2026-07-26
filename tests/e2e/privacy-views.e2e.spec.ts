import { expect, test } from '@playwright/test'

/**
 * Task 6C (refs 3-9, 3-10) — the password-policy management view and the
 * auto-generated privacy org chart are REGISTERED and AUTH-GATED. Like the
 * Phase-5 custom views (traffic-stats / error-access-history), this repo has NO
 * authenticated-admin e2e (admin login is a two-step password → Google-OTP
 * flow), so this asserts the UNAUTHENTICATED posture: each route exists and an
 * anonymous visitor sees the view's own gated state, never any policy text or
 * org data.
 *
 * The authenticated behavior is covered off the HTTP layer:
 *  - the "most-recent-active wins" surfacing + createdBy + the view gate —
 *    tests/int/passwordPolicy.int.spec.ts (+ tests/unit/passwordPolicy.spec.ts);
 *  - the role-derived chart + re-derivation + the view gate —
 *    tests/int/privacyOrgChart.int.spec.ts (+ tests/unit/privacyOrgChart.spec.ts).
 */
test.describe('Privacy management views (password policy + org chart)', () => {
  test('password-policies is registered and gated (anon sees no policy)', async ({ page }) => {
    const response = await page.goto('/admin/password-policies')
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator('body')).toContainText(
      /you must be signed in|do not have permission/i,
    )
    await expect(page.locator('body')).not.toContainText('CURRENTLY LIVE POLICY')
  })

  test('privacy-org-chart is registered and gated (anon sees no org data)', async ({ page }) => {
    const response = await page.goto('/admin/privacy-org-chart')
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator('body')).toContainText(
      /you must be signed in|do not have permission/i,
    )
    await expect(page.locator('body')).not.toContainText('Chief Privacy Officer')
  })
})
