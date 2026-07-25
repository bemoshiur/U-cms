import { expect, test } from '@playwright/test'

/**
 * Member auth e2e (Task 4B): the full public-site flow — sign up → log in → see
 * the member-only nav (My profile / Log out) → log out. Assumes the DB is seeded
 * (`pnpm seed`) so the demo site renders. Uses unique credentials per run so the
 * signup uniqueness checks never collide across runs.
 */
test.describe('Member auth', () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const loginId = `e2e-member-${suffix}`
  const email = `e2e-member-${suffix}@example.com`
  const password = 'E2e-Member-2026'

  test('sign up, log in, see member nav, and log out', async ({ page }) => {
    // ── Sign up ───────────────────────────────────────────────────────────
    await page.goto('/signup')
    await page.fill('#loginId', loginId)
    await page.fill('#email', email)
    await page.fill('#name', 'E2E Member')
    await page.fill('#password', password)
    await page.fill('#confirmPassword', password)
    await page.check('#agreeService')
    await page.check('#agreePrivacy')
    await page.click('button[type="submit"]')

    // Redirected to login with the "account created" notice.
    await page.waitForURL(/\/login/)
    await expect(page.locator('.auth__notice')).toBeVisible()

    // ── Log in (by email) ─────────────────────────────────────────────────
    await page.fill('#identifier', email)
    await page.fill('#password', password)
    await page.click('button[type="submit"]')

    // Landed on the profile page.
    await page.waitForURL(/\/profile/)
    await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeVisible()

    // ── Member-only nav is exposed ────────────────────────────────────────
    const header = page.locator('header.site-header')
    await expect(header.getByRole('link', { name: /my profile/i })).toBeVisible()
    await expect(header.getByRole('button', { name: /log out/i })).toBeVisible()
    // Logged-out guide links are hidden while a member session is active.
    await expect(header.getByRole('link', { name: /^Sign up$/ })).toHaveCount(0)

    // ── Log out ───────────────────────────────────────────────────────────
    await header.getByRole('button', { name: /log out/i }).click()
    await page.waitForURL('http://localhost:3000/')
    // Back to the logged-out guide bar (default label is "Login" / "Sign up"),
    // and the member-only links are gone.
    await expect(header.getByRole('link', { name: /^Login$/ })).toBeVisible()
    await expect(header.getByRole('link', { name: /^Sign up$/ })).toBeVisible()
    await expect(header.getByRole('button', { name: /log out/i })).toHaveCount(0)
  })

  test('log in by seeded login ID resolves to the account', async ({ page }) => {
    // The seed creates an active demo member; log in by its LOGIN ID (not email)
    // to exercise the identifier → email resolution.
    await page.goto('/login')
    await page.fill('#identifier', 'demo-member')
    await page.fill('#password', 'Pulse-Member-2026')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/profile/)
    await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeVisible()
  })
})
