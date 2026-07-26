import { expect, test } from '@playwright/test'

/**
 * Public board browse flow (Task 4C). Assumes the DB was seeded (`pnpm seed`,
 * which runs `publicSiteStep` → a Notices board menu + a notice post with an
 * attachment). Exercises the real content path: home → board list → post detail
 * → managed-download attachment link (`/api/files/download`, never a raw media
 * path). The MEDIUM-1 hidden-menu direct-URL gate is proven at the integration
 * level (tests/int/publicContent.int.spec.ts); here we cover a 404 path too.
 */
test.describe('Public board frontend', () => {
  test('browse board list → open a post → see a managed-download attachment link', async ({
    page,
  }) => {
    await page.goto('/')

    // The seeded "Notices" board menu is a top-level GNB link to /board/{bbsId}.
    const noticesLink = page.getByRole('link', { name: 'Notices' }).first()
    await expect(noticesLink).toBeVisible()
    const boardHref = await noticesLink.getAttribute('href')
    expect(boardHref).toMatch(/^\/board\/B\d+$/)

    // Board list renders with the board name heading and the seeded post row.
    const listResponse = await page.goto(boardHref!)
    expect(listResponse?.ok()).toBeTruthy()
    await expect(page.getByRole('heading', { level: 1, name: 'Notice' })).toBeVisible()

    // The admin HTML header notice is sanitized: the safe text renders, the
    // injected <script> is stripped and never executes (XSS gate, runtime proof).
    await expect(page.locator('.board-header-notice')).toContainText('This is the Notice board')
    const xss = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)
    expect(xss).toBeUndefined()

    const postLink = page.getByRole('link', { name: /Welcome to the demo notice board/i })
    await expect(postLink).toBeVisible()

    // Open the post detail.
    await postLink.click()
    await expect(
      page.getByRole('heading', { level: 1, name: /Welcome to the demo notice board/i }),
    ).toBeVisible()

    // The attachment renders as a managed-download link — NEVER a raw media path.
    const attachmentLink = page.locator('a.attachments__link').first()
    await expect(attachmentLink).toBeVisible()
    const href = await attachmentLink.getAttribute('href')
    expect(href).toMatch(/^\/api\/files\/download\?post=\d+&fileSn=\d+$/)
  })

  test('a non-existent post under a real board returns 404', async ({ page }) => {
    await page.goto('/')
    const boardHref = await page.getByRole('link', { name: 'Notices' }).first().getAttribute('href')
    const response = await page.goto(`${boardHref}/99999999`)
    expect(response?.status()).toBe(404)
  })
})
