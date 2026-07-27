import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './helpers/auth'
import { E2E_CONTENT, E2E_PRIVACY } from './helpers/credentials'
import { readFixtures } from './helpers/fixtures'

/**
 * Suite 2b — §3 privacy gating, end-to-end in the browser (Task 7C, TODO 7.1).
 * A content admin cannot REACH the Privacy Protection System — neither the
 * personal-info access-log collection nor a §3 security-document board — while
 * the privacy officer can. Proves the gate at the rendered-route level, not just
 * the API (which the int suite covers).
 */
test.describe('§3 privacy gating', () => {
  test('a content admin is denied the §3 personal-info logs + a security-doc board', async ({
    page,
  }) => {
    const { securityDocBoardId, securityDocBoardName } = readFixtures()
    await loginAsAdmin(page, E2E_CONTENT)

    // The §3 audit collection: no privacy.personalInfoLogs grant → hard 404.
    const logsResp = await page.goto('/admin/collections/personalInfoAccessLogs')
    expect(logsResp?.status()).toBe(404)

    // A §3 security-document board (securityDoc: true) is filtered out of the
    // content admin's board access → the detail bounces to the list with a
    // notFound marker; the board name never renders.
    await page.goto(`/admin/collections/boards/${securityDocBoardId}`)
    await expect(page).toHaveURL(new RegExp(`notFound=${securityDocBoardId}`))
    await expect(page.locator('#field-name')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(securityDocBoardName)
  })

  test('the privacy officer CAN reach the §3 logs + the security-doc board', async ({ page }) => {
    const { securityDocBoardId, securityDocBoardName } = readFixtures()
    await loginAsAdmin(page, E2E_PRIVACY)

    // The §3 audit collection renders (no 404).
    const logsResp = await page.goto('/admin/collections/personalInfoAccessLogs')
    expect(logsResp?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/admin\/collections\/personalInfoAccessLogs/)
    await expect(page).toHaveTitle(/Personal Info Access Logs/)

    // The §3 security-document board detail renders with its name.
    await page.goto(`/admin/collections/boards/${securityDocBoardId}`)
    await expect(page).toHaveURL(new RegExp(`/admin/collections/boards/${securityDocBoardId}`))
    await expect(page.locator('#field-name')).toHaveValue(securityDocBoardName)
  })
})
