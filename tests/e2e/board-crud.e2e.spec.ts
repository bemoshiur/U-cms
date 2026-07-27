import { expect, test, type Page } from '@playwright/test'

import { getAdminToken, jsonAuth } from './helpers/api'
import { loginAsAdmin, loginAsMember } from './helpers/auth'
import { DEMO_MEMBER, E2E_CONTENT, E2E_SUPER } from './helpers/credentials'
import { readFixtures } from './helpers/fixtures'

/**
 * Suite 3 — Board CRUD + Q&A, end-to-end (Task 7C, TODO 7.1).
 *
 * The admin-side CREATE of the container board (and the Notice seed post) uses
 * the authenticated admin REST API — the Payload admin's relationship pickers
 * over the pollution-heavy demo tenant are too flaky to form-drive reliably —
 * but everything the test actually ASSERTS is browser-driven: the admin creates
 * a POST via the real admin form (its board picker is reliable because the board
 * name is unique), the post is visible in the admin list + detail, an admin post
 * renders on the PUBLIC board frontend, and the Q&A round-trip (member asks via
 * the public form → admin answers → the answer is visible) is fully in-browser.
 */

const ts = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

/** Picks the first matching option in a Payload relationship react-select. */
async function pickRelationship(page: Page, fieldName: string, searchText: string): Promise<void> {
  const combo = page.locator(`#field-${fieldName}`).getByRole('combobox')
  await combo.waitFor({ state: 'visible', timeout: 15000 })
  await combo.click()
  await combo.fill(searchText)
  await page.locator('.rs__option', { hasText: searchText }).first().click()
}

/**
 * The multi-tenant plugin opens an "assign tenant" modal on the create view for
 * a tenant-scoped collection; select the (single) tenant and confirm to proceed.
 */
async function confirmAssignTenant(page: Page): Promise<void> {
  const modal = page.locator('#assign-tenant-field-modal')
  await modal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  if (!(await modal.isVisible().catch(() => false))) {
    return
  }
  await modal.locator('.rs__control').click()
  await page.locator('.rs__option').first().click()
  await modal.getByRole('button', { name: 'Confirm' }).click()
  await expect(modal).toBeHidden()
}

test.describe('Board CRUD', () => {
  test('admin creates a post via the admin UI; it is visible in the list + detail', async ({
    page,
    request,
  }) => {
    const { superTotpSecret, demoSiteId } = readFixtures()
    const token = await getAdminToken(request, { ...E2E_SUPER, totpSecret: superTotpSecret })

    // Container board via the authenticated admin API (unique name → the post's
    // board picker resolves to exactly one option).
    const boardName = `E2E-Board-${ts()}`
    const bt = await request.get('/api/boardTypes?where[code][equals]=PG0001&limit=1&depth=0', {
      headers: jsonAuth(token),
    })
    const btId = ((await bt.json()) as { docs?: { id: number }[] }).docs?.[0]?.id
    expect(btId, 'PG0001 board type').toBeTruthy()
    const boardRes = await request.post('/api/boards', {
      headers: jsonAuth(token),
      data: { tenant: demoSiteId, name: boardName, boardType: btId, boardForm: 'list' },
    })
    expect(boardRes.ok(), `create board: ${boardRes.status()}`).toBeTruthy()

    // Drive the admin form as the SINGLE-tenant content editor — a multi-tenant
    // super triggers the plugin's "assign tenant" modal on create, which the
    // single-tenant admin never sees (its one site is auto-assigned).
    await loginAsAdmin(page, E2E_CONTENT)

    // Create the POST through the real admin form.
    const postTitle = `E2E-Post-${ts()}`
    await page.goto('/admin/collections/posts/create')
    await confirmAssignTenant(page)
    await expect(page.locator('#field-title')).toBeVisible()
    await pickRelationship(page, 'board', boardName)
    await page.locator('#field-title').fill(postTitle)
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    // Landed on the created post's DETAIL with the title persisted.
    await expect(page.locator('#field-title')).toHaveValue(postTitle)

    // Visible in the admin posts LIST (search by title).
    await page.goto('/admin/collections/posts?limit=10')
    await page.locator('.search-filter__input').fill(postTitle)
    await expect(page.getByRole('link', { name: postTitle })).toBeVisible()
  })

  test('an admin post appears on the public board frontend', async ({ page, request }) => {
    const { superTotpSecret, noticeBoardId, noticeBoardBbsId } = readFixtures()
    const token = await getAdminToken(request, { ...E2E_SUPER, totpSecret: superTotpSecret })

    // Publish a post on the seeded (menu-linked, public) Notice board.
    const postTitle = `E2E-Public-Post-${ts()}`
    const res = await request.post('/api/posts', {
      headers: jsonAuth(token),
      data: { board: noticeBoardId, title: postTitle, author: 'E2E' },
    })
    expect(res.ok(), `create notice post: ${res.status()}`).toBeTruthy()

    // The public board list shows the new post; its detail renders the title.
    await page.goto(`/board/${noticeBoardBbsId}`)
    const link = page.getByRole('link', { name: postTitle })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page.getByRole('heading', { level: 1, name: postTitle })).toBeVisible()
  })

  test('Q&A: a member asks, an admin answers, and the answer is visible publicly', async ({
    page,
    browser,
  }) => {
    const { qnaBoardBbsId, superTotpSecret } = readFixtures()
    const marker = ts()
    const questionTitle = `E2E-Question-${marker}`

    // ── Member asks via the public Q&A form ──────────────────────────────────
    await loginAsMember(page, {
      identifier: DEMO_MEMBER.identifier,
      password: DEMO_MEMBER.password,
    })
    await page.goto(`/board/${qnaBoardBbsId}`)
    await page.locator('#ask-title').fill(questionTitle)
    await page.locator('#ask-content').fill('E2E automated question body.')
    await page.getByRole('button', { name: 'Submit question' }).click()
    await expect(page.locator('.qna__notice')).toContainText(/posted/i)

    // Resolve the new question's post id from its list link.
    const questionLink = page
      .locator('.qna__item', { hasText: questionTitle })
      .locator('.qna__link')
    await expect(questionLink).toBeVisible()
    const href = await questionLink.getAttribute('href')
    const postId = href?.split('/').pop()
    expect(postId, 'question post id').toBeTruthy()
    // Before the answer, the question is Pending.
    await expect(
      page.locator('.qna__item', { hasText: questionTitle }).locator('.qna__status'),
    ).toContainText('Pending')

    // ── Admin answers (separate context — members share the token cookie) ─────
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    try {
      await loginAsAdmin(adminPage, { ...E2E_SUPER, totpSecret: superTotpSecret })
      await adminPage.goto(`/admin/collections/posts/${postId}`)
      const answerText = `E2E-Answer-${marker}`
      // The Q&A `answer` is the 2nd Lexical editor (post `content` is the 1st).
      const answerEditor = adminPage.locator('[data-lexical-editor="true"]').nth(1)
      await answerEditor.click()
      await adminPage.keyboard.type(answerText)
      await adminPage.getByRole('button', { name: 'Save', exact: true }).click()
      // Payload shows a success toast on save.
      await expect(adminPage.locator('.payload-toast-item.toast-success').first()).toBeVisible({
        timeout: 15000,
      })

      // ── The answer is now visible on the PUBLIC question detail ─────────────
      await page.goto(`/board/${qnaBoardBbsId}/${postId}`)
      const answer = page.locator('.post-detail__answer')
      await expect(answer).toBeVisible()
      await expect(answer).toContainText(answerText)
    } finally {
      await adminContext.close()
    }
  })
})
