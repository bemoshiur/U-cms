import { expect, test } from '@playwright/test'

/**
 * Task 5A (TODO 5.2) — the custom Traffic Statistics admin view is REGISTERED
 * and AUTH-GATED. This repo has no authenticated-admin e2e (admin login is a
 * two-step password → Google-OTP flow), so — like `admin-smoke` — this asserts
 * the unauthenticated posture: the custom view route exists and an anonymous
 * visitor is bounced to the admin login rather than seeing any statistics. The
 * view's DATA correctness (tenant scoping, the 5 tabs, exports) is covered by
 * the int tests over the shared `trafficStatsData` / export helpers it renders.
 */
test.describe('Traffic Statistics admin view', () => {
  test('the custom view route is registered and gated (anon sees no stats)', async ({ page }) => {
    const response = await page.goto('/admin/traffic-statistics')

    // The route resolves (registered — not a hard 404/500) ...
    expect(response?.status()).toBeLessThan(500)
    // ... Payload renders the view's gated state for an anonymous visitor
    // (the component's own "signed in" gate + Payload's Unauthorized chrome) ...
    await expect(page.locator('body')).toContainText(/you must be signed in|unauthorized/i)
    // ... and CRUCIALLY leaks NO statistics to an unauthenticated visitor.
    await expect(page.locator('body')).not.toContainText('Total page views')
  })
})
