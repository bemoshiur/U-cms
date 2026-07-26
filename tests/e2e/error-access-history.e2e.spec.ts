import { expect, test } from '@playwright/test'

/**
 * Task 5C (refs 1-56..1-59, 2-20) — the custom Error Statistics + Access History
 * admin views are REGISTERED and AUTH-GATED. Like `traffic-stats`, this asserts
 * the unauthenticated posture: each route exists and an anonymous visitor sees
 * the gated state, never any error/access data. The views' DATA correctness
 * (aggregation, drill-down, masking, gating, exports) is covered by the unit +
 * int tests over the shared helpers they render.
 */
test.describe('Error Statistics + Access History admin views', () => {
  test('error-statistics is registered and gated (anon sees no data)', async ({ page }) => {
    const response = await page.goto('/admin/error-statistics')
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator('body')).toContainText(/you must be signed in|unauthorized/i)
    await expect(page.locator('body')).not.toContainText('Total errors in range')
  })

  test('access-history is registered and gated (anon sees no data)', async ({ page }) => {
    const response = await page.goto('/admin/access-history')
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator('body')).toContainText(/you must be signed in|unauthorized/i)
    await expect(page.locator('body')).not.toContainText('Admin back-office access history')
  })
})
