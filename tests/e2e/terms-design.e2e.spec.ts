import { expect, test } from '@playwright/test'

/**
 * Task 4E e2e — the versioned terms pages, the satisfaction widget, and the
 * cohesive design pass (screenshots at mobile + desktop + basic accessibility:
 * semantic landmarks, image alt text, and labelled form controls). Assumes the
 * DB was seeded (`pnpm seed`), which publishes the 5 terms categories, enables
 * the demo site's satisfaction toggle, and seeds a content page.
 */

const SHOTS = process.env.SHOT_DIR || 'test-results/task-4e'

test.describe('Task 4E — terms, satisfaction, design', () => {
  test('terms page renders the active version, category tabs, and change history', async ({
    page,
  }) => {
    const res = await page.goto('/terms/personalInfoProcessing')
    expect(res?.ok()).toBeTruthy()

    // Landmarks (accessibility).
    await expect(page.locator('header.site-header')).toBeVisible()
    await expect(page.locator('main#main-content')).toBeVisible()
    await expect(page.locator('footer.site-footer')).toBeVisible()

    // Title + the five category tabs + the active-tab marker.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const tabs = page.locator('.terms-tabs__item')
    await expect(tabs).toHaveCount(5)
    await expect(page.locator('.terms-tabs__link--active')).toBeVisible()

    // The privacy doc was seeded with two published versions → history shows.
    await expect(page.getByRole('heading', { name: /change history/i })).toBeVisible()
    await expect(page.locator('.terms-history__table tbody tr').first()).toBeVisible()
  })

  test('unknown terms category returns 404', async ({ page }) => {
    const res = await page.goto('/terms/notARealCategory')
    expect(res?.status()).toBe(404)
  })

  test('content page shows the satisfaction widget and accepts a rating', async ({ page }) => {
    // Reach a content page via the sitemap (robust to the seeded menu number).
    await page.goto('/sitemap')
    await page.getByRole('link', { name: 'Introduction' }).first().click()
    await expect(page).toHaveURL(/\/page\/\d+/)

    const widget = page.locator('section.satisfaction')
    await expect(widget).toBeVisible()
    await expect(widget.getByRole('heading', { name: /was this page helpful/i })).toBeVisible()

    // Five labelled rating levels (a11y: each radio is inside a <label>).
    const levels = widget.locator('label.satisfaction__level')
    await expect(levels).toHaveCount(5)

    // Submit a rating → the thank-you replaces the form.
    await widget.locator('input[name="score"][value="5"]').check()
    await widget.getByRole('button', { name: /submit rating/i }).click()
    await expect(page.locator('.satisfaction__thanks')).toBeVisible()
  })

  test('accessibility basics: landmarks, image alt, labelled controls', async ({ page }) => {
    await page.goto('/')
    // Skip link + landmarks.
    await expect(page.locator('a.skip-link')).toHaveText(/skip to content/i)
    await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible()

    // Every image on the home page has a non-empty alt attribute.
    const imgs = page.locator('img')
    const count = await imgs.count()
    for (let i = 0; i < count; i++) {
      const alt = await imgs.nth(i).getAttribute('alt')
      expect(alt, `image #${i} must have alt text`).toBeTruthy()
    }

    // Signup form controls are all labelled (label[for] ↔ input id).
    await page.goto('/signup')
    for (const id of ['loginId', 'email', 'name', 'password', 'confirmPassword']) {
      await expect(page.locator(`label[for="${id}"]`)).toBeVisible()
      await expect(page.locator(`input#${id}`)).toBeVisible()
    }
  })

  test('design screenshots: home + terms at mobile and desktop', async ({ page }) => {
    for (const [label, width, height] of [
      ['mobile', 375, 812],
      ['desktop', 1280, 900],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await expect(page.locator('footer.site-footer')).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/home-${label}.png`, fullPage: true })

      await page.goto('/terms/termsOfUse')
      await expect(page.locator('.terms-tabs')).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/terms-${label}.png`, fullPage: true })

      await page.goto('/survey')
      await page.screenshot({ path: `${SHOTS}/survey-index-${label}.png`, fullPage: true })
    }
  })
})
