import { expect, test } from '@playwright/test'

/**
 * Task 6B (refs 1-36, 1-37) — the member-management LIST + audited DETAIL screens
 * (with the export purpose modal and the PII watermark) are REGISTERED and
 * AUTH-GATED. Like the Phase-5 custom views and the Task 5D dashboard, this repo
 * has NO authenticated-admin e2e (admin login is a two-step password → Google-OTP
 * flow), so this asserts the UNAUTHENTICATED posture: the member routes exist,
 * an anonymous visitor is bounced to the auth form, and NO member PII, export
 * control, or watermark leaks to an anon visitor.
 *
 * The behavior that needs an authenticated admin is covered off the HTTP layer:
 *  - watermark data is server-derived + tied to the immutable audit row —
 *    `tests/int/memberWatermark.int.spec.ts` (+ pure derivation + the screen/print
 *    CSS path in `tests/unit/memberWatermark.spec.ts`);
 *  - list PII masking, the audited full-PII detail read, and the purpose-gated
 *    export (200 with a purpose, 400/403 without) — `tests/int/personalInfo.int.spec.ts`.
 */
test.describe('Member management screens (list + audited detail)', () => {
  test('the members list route is registered and gated (anon sees no PII/export)', async ({
    page,
  }) => {
    const response = await page.goto('/admin/collections/members')
    expect(response?.status()).toBeLessThan(500)

    // Anonymous → the auth form, never the member list.
    await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
    await expect(page.locator('#field-email')).toBeVisible()

    const body = page.locator('body')
    await expect(body).not.toContainText('Export members (열람목적)')
    await expect(body).not.toContainText('member@demo.example.com')
  })

  test('a member detail route is registered and gated (anon sees no watermark/PII)', async ({
    page,
  }) => {
    const response = await page.goto('/admin/collections/members/1')
    expect(response?.status()).toBeLessThan(500)

    await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
    // The watermark overlay must never render for an unauthenticated visitor.
    await expect(page.locator('.pii-watermark')).toHaveCount(0)
  })
})
