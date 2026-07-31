import { expect, test } from '@playwright/test'

/**
 * Public-site smoke (Task 4A). Assumes the DB was seeded (`pnpm seed`, which
 * runs `publicSiteStep`), so the demo site has a logo, footer, GNB menus, and a
 * sitemap. Asserts the shared chrome (skip link, header/logo, primary nav,
 * footer) and the sitemap route render — the foundation later Phase-4 tasks
 * build on.
 */
test.describe('Public site', () => {
  test('home renders logo, primary nav, and footer within semantic landmarks', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.ok()).toBeTruthy()

    // Skip-to-content link (accessibility landmark entry point).
    await expect(page.locator('a.skip-link')).toHaveText(/skip to content/i)

    // Header + brand logo (the demo site seeds a logo image).
    const header = page.locator('header.site-header')
    await expect(header).toBeVisible()
    await expect(header.locator('img.site-brand__logo')).toBeVisible()

    // Primary navigation with at least the seeded top-level menus.
    const primaryNav = page.locator('nav[aria-label="Primary"]')
    await expect(primaryNav).toBeVisible()
    await expect(primaryNav.locator('.gnb__item').first()).toBeVisible()

    // Main landmark + footer with the seeded copyright line.
    await expect(page.locator('main#main-content')).toBeVisible()
    const footer = page.locator('footer.site-footer')
    await expect(footer).toBeVisible()
    await expect(footer).toContainText(/rights reserved/i)
  })

  test('home renders the seeded live banner, notification tile, and site-wide popup', async ({
    page,
  }) => {
    const response = await page.goto('/')
    expect(response?.ok()).toBeTruthy()

    // Banner strip (Task 4E, ref 2-1: the demo site seeds one active banner).
    const bannerStrip = page.locator('section.banner-strip')
    await expect(bannerStrip).toBeVisible()
    await expect(bannerStrip.locator('img.banner-strip__img').first()).toBeVisible()

    // Notification tiles (a third home-page section alongside Notices / Quick menu).
    const notificationTiles = page.locator('section.notification-tiles')
    await expect(notificationTiles).toBeVisible()
    await expect(notificationTiles.locator('img.notification-tiles__img').first()).toBeVisible()

    // Site-wide popup — client-rendered after hydration (useSyncExternalStore).
    const popup = page.locator('.popup-window').first()
    await expect(popup).toBeVisible()
    await expect(popup.getByRole('button', { name: /close/i })).toBeVisible()

    // Closing persists a "close for a day" suppression in localStorage — a
    // reload should NOT bring the popup back.
    await popup.getByRole('button', { name: /close/i }).click()
    await expect(popup).toBeHidden()
    await page.reload()
    await expect(page.locator('.popup-window')).toHaveCount(0)
  })

  test('sitemap route renders the menu tree', async ({ page }) => {
    const response = await page.goto('/sitemap')
    expect(response?.ok()).toBeTruthy()
    await expect(page.getByRole('heading', { level: 1, name: 'Sitemap' })).toBeVisible()
    await expect(page.locator('ul.sitemap li').first()).toBeVisible()
  })

  test('unknown board id returns 404', async ({ page }) => {
    const response = await page.goto('/board/B0000000')
    expect(response?.status()).toBe(404)
  })
})
