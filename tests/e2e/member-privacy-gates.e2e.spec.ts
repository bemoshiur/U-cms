import { expect, test } from '@playwright/test'

import { getAdminToken, jsonAuth } from './helpers/api'
import { loginAsAdmin } from './helpers/auth'
import { E2E_SUPER } from './helpers/credentials'
import { readFixtures } from './helpers/fixtures'

/**
 * Suite 4 — Member privacy gates, end-to-end (Task 7C, TODO 7.1). The audited
 * member-detail read writes a personalInfoAccessLogs `view` and paints the
 * server-derived anti-exfiltration watermark; the CSV export is gated behind a
 * purpose modal (blocked without a purpose, server-enforced too); and the list
 * masks member PII.
 */
test.describe('Member privacy gates', () => {
  test('opening a member detail logs a view + renders the server watermark', async ({
    page,
    request,
  }) => {
    const { superTotpSecret, demoMemberId } = readFixtures()
    const token = await getAdminToken(request, { ...E2E_SUPER, totpSecret: superTotpSecret })
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })

    // Filter by the subject only — a single-doc member READ only ever logs a
    // `view` (edits log `edit`, and this test never edits), and combining two
    // `where` keys over the query string is brittle in this Payload version.
    const logQuery = `/api/personalInfoAccessLogs?where[subjectMemberId][equals]=${demoMemberId}&limit=1&depth=0`
    const viewCount = async (): Promise<number> => {
      const res = await request.get(logQuery, { headers: jsonAuth(token) })
      return ((await res.json()) as { totalDocs?: number }).totalDocs ?? 0
    }
    const before = await viewCount()

    await page.goto(`/admin/collections/members/${demoMemberId}`)

    // Server-rendered watermark tied to this audited view.
    const watermark = page.locator('.pii-watermark')
    await expect(watermark).toBeVisible()
    await expect(watermark).toHaveAttribute('data-mgmt-no', /PIA-\d+/)
    // Viewer identity + a server timestamp are baked into the tile text.
    await expect(page.locator('.pii-watermark__tile').first()).toContainText('e2e-super')
    await expect(page.locator('.pii-watermark__tile').first()).toContainText(/UTC/)

    // The audited read wrote a NEW personalInfoAccessLogs 'view' row (the write
    // lands in its own isolated transaction, so poll for it to commit).
    await expect.poll(viewCount, { timeout: 10000 }).toBeGreaterThan(before)
  })

  test('the member export is purpose-gated (modal + server)', async ({ page }) => {
    const { superTotpSecret } = readFixtures()
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })
    await page.goto('/admin/collections/members?limit=10')

    // Open the export modal; the submit is disabled until a purpose is entered.
    await page.getByRole('button', { name: /Export members/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const exportCsv = dialog.getByRole('button', { name: /Export CSV/ })
    await expect(exportCsv).toBeDisabled()

    await dialog.locator('textarea').fill('E2E: verifying the purpose gate')
    await expect(exportCsv).toBeEnabled()

    // The server is the real boundary: a purpose-less export is rejected (400).
    const noPurpose = await page.request.post('/api/members/export', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    })
    expect(noPurpose.status()).toBe(400)
  })

  test('member PII is masked in the list', async ({ page }) => {
    const { superTotpSecret } = readFixtures()
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })
    await page.goto('/admin/collections/members?limit=25')

    const body = page.locator('body')
    // Masked emails (a***@domain) are present; no raw seeded email leaks.
    await expect(body).toContainText(/[a-z0-9]\*\*\*@/i)
    await expect(body).not.toContainText('member@demo.example.com')
  })
})
