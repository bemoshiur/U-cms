import { expect, test } from '@playwright/test'

/**
 * Task 5B (TODO 5.3/5.4) — the custom Download- and Satisfaction-Statistics
 * admin views are REGISTERED and AUTH-GATED. Like `traffic-stats`, this repo has
 * no authenticated-admin e2e (admin login is a two-step password → Google-OTP
 * flow), so this asserts the unauthenticated posture: each custom view route
 * exists and an anonymous visitor is bounced to the admin login / gated state
 * rather than seeing any statistics. Data correctness (tenant scoping, the
 * tables, exports) is covered by the int tests over the shared helpers.
 */
test.describe('Download & Satisfaction Statistics admin views', () => {
  test('download-statistics is registered and gated (anon sees no stats)', async ({ page }) => {
    const response = await page.goto('/admin/download-statistics')
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator('body')).toContainText(/you must be signed in|unauthorized/i)
    await expect(page.locator('body')).not.toContainText('Total downloads')
  })

  test('satisfaction-statistics is registered and gated (anon sees no stats)', async ({ page }) => {
    const response = await page.goto('/admin/satisfaction-statistics')
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator('body')).toContainText(/you must be signed in|unauthorized/i)
    await expect(page.locator('body')).not.toContainText('Weighted average')
  })
})
