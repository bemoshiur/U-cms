import { expect, test, type Page } from '@playwright/test'

import { loginAsAdmin } from './helpers/auth'
import { E2E_CONTENT, E2E_PRIVACY, E2E_SUPER } from './helpers/credentials'
import { readFixtures } from './helpers/fixtures'

/**
 * Suite 2 — RBAC nav visibility (Task 7C, TODO 7.1). The int suite proves the
 * server-side access decisions; this asserts the END-TO-END rendered nav each
 * role actually sees in the admin panel:
 *  - a limited content editor sees its Content collections but NOT the §3 Privacy
 *    subsystem, admin users, or member management;
 *  - the privacy officer sees the Privacy Protection System (incl. the org chart)
 *    but NOT the content-only collections;
 *  - the super-admin sees everything.
 */

/** All visible admin nav link texts (waits for the nav to render). */
async function navTexts(page: Page): Promise<string[]> {
  await expect(page.locator('.nav a').first()).toBeVisible({ timeout: 15000 })
  return page.locator('.nav a').allInnerTexts()
}

test.describe('RBAC nav visibility', () => {
  test('content editor sees ONLY its content nav (no §3 / users / members)', async ({ page }) => {
    await loginAsAdmin(page, E2E_CONTENT)
    const texts = (await navTexts(page)).map((t) => t.trim())

    // Granted content collections are present.
    expect(texts).toContain('Boards')
    expect(texts).toContain('Posts')
    expect(texts).toContain('Surveys')

    // NOT the privacy §3 subsystem, admin users, or member management.
    expect(texts).not.toContain('Personal Info Access Logs')
    expect(texts).not.toContain('Privacy Organization Chart')
    expect(texts).not.toContain('Users')
    expect(texts).not.toContain('Members')
  })

  test('privacy officer sees the §3 Privacy subsystem (not content-only areas)', async ({
    page,
  }) => {
    await loginAsAdmin(page, E2E_PRIVACY)
    const texts = (await navTexts(page)).map((t) => t.trim())

    // The §3 Privacy Protection System + the derived org chart view.
    expect(texts).toContain('Personal Info Access Logs')
    expect(texts).toContain('Privacy Organization Chart')

    // NOT the content-only collections nor admin-user management.
    expect(texts).not.toContain('Surveys')
    expect(texts).not.toContain('Users')
    expect(texts).not.toContain('Members')
  })

  test('super-admin sees everything', async ({ page }) => {
    const { superTotpSecret } = readFixtures()
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })
    const texts = (await navTexts(page)).map((t) => t.trim())

    expect(texts).toContain('Users')
    expect(texts).toContain('Members')
    expect(texts).toContain('Boards')
    expect(texts).toContain('Surveys')
    expect(texts).toContain('Personal Info Access Logs')
    expect(texts).toContain('Roles')
  })
})
