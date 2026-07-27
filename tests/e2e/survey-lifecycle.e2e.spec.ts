import { expect, test } from '@playwright/test'

import { getAdminToken, jsonAuth } from './helpers/api'
import { loginAsAdmin } from './helpers/auth'
import { E2E_SUPER } from './helpers/credentials'
import { readFixtures } from './helpers/fixtures'

/**
 * Suite 5 — Survey lifecycle, end-to-end (Task 7C, TODO 7.1).
 *
 * The survey + question are created through the authenticated admin REST API
 * (real access control + hooks; the admin tenant/relationship pickers are too
 * flaky to form-drive over the polluted demo tenant), then the flow is
 * browser-driven: an anonymous visitor responds on the PUBLIC site, the
 * in-progress aggregate results render (resultVisibility: duringAndAfter), the
 * admin CSV export returns the aggregate, and — once the survey has STARTED (it
 * now has a response) — editing a question in the admin UI is BLOCKED by the
 * ref-2-12 immutability gate.
 */
const ts = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

test.describe('Survey lifecycle', () => {
  test('create → open → respond → results → export → question immutability', async ({
    page,
    request,
    browser,
  }) => {
    const { superTotpSecret, demoSiteId } = readFixtures()
    const token = await getAdminToken(request, { ...E2E_SUPER, totpSecret: superTotpSecret })

    // ── Admin creates an OPEN survey (no openFrom ⇒ open, questions still
    //    editable until the first response) + one free-text question ───────────
    const title = `E2E-Survey-${ts()}`
    const questionText = `How was your E2E experience ${ts()}?`
    const surveyRes = await request.post('/api/surveys', {
      headers: jsonAuth(token),
      data: {
        tenant: demoSiteId,
        title,
        audience: 'anyone',
        resultVisibility: 'duringAndAfter',
        isActive: true,
      },
    })
    expect(surveyRes.ok(), `create survey: ${surveyRes.status()}`).toBeTruthy()
    const surveyId = ((await surveyRes.json()) as { doc: { id: number } }).doc.id

    const qRes = await request.post('/api/surveyQuestions', {
      headers: jsonAuth(token),
      data: { survey: surveyId, order: 1, text: questionText, type: 'text', required: true },
    })
    expect(qRes.ok(), `create question: ${qRes.status()}`).toBeTruthy()
    const questionId = ((await qRes.json()) as { doc: { id: number } }).doc.id

    // ── A public (anonymous) visitor responds ────────────────────────────────
    const anon = await browser.newContext()
    const anonPage = await anon.newPage()
    try {
      await anonPage.goto(`/survey/${surveyId}`)
      await expect(anonPage.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(anonPage.locator('legend.survey-question__text').first()).toContainText(
        questionText,
      )
      // A `text` (short-text) question renders an <input name="text_{order}">.
      await anonPage.locator('input[name="text_1"]').fill('It worked end to end.')
      await anonPage.getByRole('button', { name: 'Submit response' }).click()

      // Thank-you + in-progress aggregate (duringAndAfter ⇒ visible while open).
      await expect(anonPage.getByText(/your response has been recorded/i)).toBeVisible()
      await expect(anonPage.getByText(/Total responses:/)).toBeVisible()
    } finally {
      await anon.close()
    }

    // ── Admin export: the aggregate CSV reflects the response ────────────────
    const exportRes = await request.get(`/api/surveys/${surveyId}/export/summary`, {
      headers: jsonAuth(token),
    })
    expect(exportRes.ok(), `export: ${exportRes.status()}`).toBeTruthy()
    const csv = await exportRes.text()
    expect(csv).toContain('Total responses')
    expect(csv).toContain(questionText)

    // ── Question immutability once the survey has started (it has a response) ─
    await loginAsAdmin(page, { ...E2E_SUPER, totpSecret: superTotpSecret })
    await page.goto(`/admin/collections/surveyQuestions/${questionId}`)
    await page.locator('#field-text').fill(`${questionText} (edited)`)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    // The ref-2-12 freeze rejects the edit; the message surfaces in the admin UI.
    await expect(page.locator('body')).toContainText(
      /can no longer be added, edited, or deleted|survey has started/i,
    )
  })
})
