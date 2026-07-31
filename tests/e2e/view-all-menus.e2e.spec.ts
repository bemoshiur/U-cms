import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './helpers/auth'
import { E2E_CONTENT, E2E_SUPER } from './helpers/credentials'
import { readFixtures } from './helpers/fixtures'

/**
 * Audit fix 3 (ref 3-11) — "View all menus" (전체 메뉴 보기), end-to-end. The int
 * suite (`tests/int/viewAllMenusOverlay.int.spec.ts`) proves the server-side
 * filtering logic against the real seed tree; this proves the SAME filtering
 * renders correctly in the browser, for the REAL `ROLE_CONTENT_EDITOR` role
 * (content-only, no system/privacy/member/statistics/standardization grants) vs
 * the super-admin — plus the dialog's dismiss/focus behavior the brief calls
 * out explicitly (Escape, backdrop click, X button, focus return).
 *
 * A WIDE viewport is forced here (default project viewport is ~1280×720):
 * verified manually that Payload's own responsive nav collapses into an
 * off-canvas "Open Menu" drawer below a certain width, and — pre-existing,
 * unrelated to this feature — that collapsed drawer's items sit BEHIND the
 * main-content wrapper for pointer-event purposes at that breakpoint (every
 * other `afterNavLinks` entry sits at the same spot in the nav, but no
 * existing e2e test had ever clicked into the drawer, only read link text).
 * At >=1600px Payload renders the nav as a permanent sidebar with no such
 * overlap, which is the realistic desktop-admin viewport this feature targets.
 */
test.use({ viewport: { width: 1920, height: 1080 } })

async function openOverlay(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: /View All Menus/i }).click()
  await expect(page.getByRole('dialog', { name: /View All Menus/i })).toBeVisible()
}

test.describe('View all menus overlay', () => {
  test('a content editor sees ONLY the Content system (no System/Privacy/Members/Statistics/Standardization)', async ({
    page,
  }) => {
    await loginAsAdmin(page, E2E_CONTENT)
    await openOverlay(page)

    const rail = page.getByRole('navigation', { name: 'Systems' })
    await expect(rail.getByRole('button', { name: 'Content Management' })).toBeVisible()
    await expect(rail.getByRole('button', { name: 'System Management' })).toHaveCount(0)
    await expect(rail.getByRole('button', { name: 'Privacy Protection' })).toHaveCount(0)
    await expect(rail.getByRole('button', { name: 'Member Management' })).toHaveCount(0)
    await expect(rail.getByRole('button', { name: 'Site Statistics' })).toHaveCount(0)
    await expect(rail.getByRole('button', { name: 'Public Data Standardization' })).toHaveCount(0)

    // Only one rail entry at all.
    await expect(rail.getByRole('button')).toHaveCount(1)

    // The selected (default) panel shows granted content menus...
    const dialog = page.getByRole('dialog', { name: /View All Menus/i })
    await expect(dialog.getByRole('link', { name: 'Post Management' })).toBeVisible()
    // ...but never a system-only menu (never leaked, not even disabled).
    await expect(dialog.getByText('Admin Menu Management')).toHaveCount(0)
    await expect(dialog.getByText('Admin Account Management')).toHaveCount(0)
  })

  test('the super-admin sees every system, including ones the content editor cannot', async ({
    page,
  }) => {
    const { superTotpSecret } = readFixtures()
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })
    await openOverlay(page)

    const rail = page.getByRole('navigation', { name: 'Systems' })
    await expect(rail.getByRole('button', { name: 'System Management' })).toBeVisible()
    await expect(rail.getByRole('button', { name: 'Content Management' })).toBeVisible()
    await expect(rail.getByRole('button', { name: 'Privacy Protection' })).toBeVisible()

    const railCount = await rail.getByRole('button').count()
    expect(railCount).toBeGreaterThanOrEqual(6)

    // Switching rail selection swaps the right-hand panel.
    await rail.getByRole('button', { name: 'System Management' }).click()
    const dialog = page.getByRole('dialog', { name: /View All Menus/i })
    await expect(dialog.getByRole('link', { name: 'Site Information Management' })).toBeVisible()
  })

  test('dismisses via the X button, Escape, and a backdrop click — focus returns to the trigger each time', async ({
    page,
  }) => {
    const { superTotpSecret } = readFixtures()
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })

    const trigger = page.getByRole('button', { name: /View All Menus/i })
    const dialog = page.getByRole('dialog', { name: /View All Menus/i })

    // X button. Scoped to the dialog + exact name: Payload's own nav-toggler
    // button is ALSO named "Close Menu", which a loose (substring) match on
    // "Close" would ambiguously match too.
    await openOverlay(page)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // Escape key.
    await openOverlay(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // Backdrop click (outside the dialog surface).
    await openOverlay(page)
    await page
      .locator('[data-testid="view-all-menus-backdrop"]')
      .click({ position: { x: 5, y: 5 } })
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
})
