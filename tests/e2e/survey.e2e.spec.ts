import { expect, test } from '@playwright/test'

/**
 * Public survey flow (Task 4D). Assumes the DB was seeded (`pnpm seed` →
 * `surveysStep`: one OPEN, `duringAndAfter`, audience-`anyone` survey with a
 * single/multi/text question set). Exercises the real path: survey index → open
 * the survey → answer → submit → see the (in-progress) aggregate results.
 */
test.describe('Public survey frontend', () => {
  test('open survey → answer → submit → see results', async ({ page }) => {
    await page.goto('/survey')

    const link = page.getByRole('link', { name: 'Demo satisfaction survey' })
    await expect(link).toBeVisible()
    await link.click()

    // The run form renders the seeded questions (target the form's legend
    // specifically — results are also shown on this duringAndAfter survey).
    await expect(
      page.getByRole('heading', { level: 1, name: 'Demo satisfaction survey' }),
    ).toBeVisible()
    await expect(page.locator('legend.survey-question__text').first()).toContainText(
      'How did you hear about us?',
    )

    // Answer Q1 (single, "The web"); Q2 is optional; fill the free-text Q3.
    await page.locator('input[name="single_1"]').first().check()
    await page.locator('textarea[name="text_3"]').fill('Automated e2e feedback')

    await page.getByRole('button', { name: 'Submit response' }).click()

    // Thank-you + results (duringAndAfter → visible while open).
    await expect(page.getByText('your response has been recorded')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'How did you hear about us?' })).toBeVisible()
    await expect(page.getByText(/Total responses:/)).toBeVisible()
  })

  test('an unknown survey id returns 404', async ({ page }) => {
    const response = await page.goto('/survey/99999999')
    expect(response?.status()).toBe(404)
  })
})
