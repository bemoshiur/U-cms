import { expect, test } from '@playwright/test'

// Matches `branding.productName` / the admin `titleSuffix` in
// src/payload.config.ts (` — ${branding.productName}`).
const BRANDED_TITLE_SUFFIX = 'Pulse CMS'

test.describe('Admin smoke', () => {
  test('/admin responds, is branded, and renders an auth form', async ({ page }) => {
    const response = await page.goto('/admin')

    expect(response?.ok()).toBeTruthy()
    await expect(page).toHaveTitle(new RegExp(BRANDED_TITLE_SUFFIX))

    // An unauthenticated visitor lands on either the login form (an admin
    // already exists) or the "create first user" form (fresh install) —
    // both render email + password fields, so assert on those rather than
    // a specific route.
    await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
    await expect(page.locator('#field-email')).toBeVisible()
    await expect(page.locator('#field-password')).toBeVisible()
  })
})
