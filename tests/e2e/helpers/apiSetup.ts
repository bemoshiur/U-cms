import { writeFileSync } from 'fs'
import { authenticator } from 'otplib'
import { expect, type APIRequestContext } from '@playwright/test'

import { E2E_CONTENT, E2E_PRIVACY, E2E_STATS, E2E_SUPER, SEED_SUPER } from './credentials'
import { FIXTURES_PATH, type E2eFixtures } from './fixtures'

/**
 * API-driven e2e provisioning (Task 7C). Runs from the `setup` project against
 * the live webServer (the only way to boot Payload's write side in this repo —
 * a standalone `getPayload` script can't load env here, and the demo DB lacks
 * the role admins the RBAC suites need). Everything is idempotent.
 */

type Role = { value: 'ROLE_CONTENT_EDITOR' | 'ROLE_STATISTICS_ANALYST'; menuKeys: string[] }

/** Menu grants for the two non-super roles the RBAC suites need created. */
const ROLES_TO_ENSURE: Role[] = [
  {
    value: 'ROLE_CONTENT_EDITOR',
    menuKeys: [
      'content',
      'content.media',
      'content.boardTypes',
      'content.boards',
      'content.posts',
      'content.notificationAreas',
      'content.popups',
      'content.banners',
      'content.adminNotices',
      'content.guideMenus',
      'content.menus',
      'content.webContents',
      'content.shortUrls',
      'content.help',
      'content.surveys',
      'content.terms',
    ],
  },
  {
    value: 'ROLE_STATISTICS_ANALYST',
    menuKeys: [
      'statistics',
      'statistics.satisfaction',
      'statistics.traffic',
      'statistics.downloads',
    ],
  },
]

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }
}

/** Logs in via the REST API and returns the JWT (handles the optional OTP step). */
async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
  otp?: string,
): Promise<string> {
  const res = await request.post('/api/users/login', {
    data: { email, password, ...(otp ? { otp } : {}) },
    headers: { 'Content-Type': 'application/json' },
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string; errors?: unknown }
  if (!res.ok() || !body.token) {
    throw new Error(`apiLogin failed for ${email}: ${res.status()} ${JSON.stringify(body)}`)
  }
  return body.token
}

async function findOne<T = Record<string, unknown>>(
  request: APIRequestContext,
  token: string,
  collection: string,
  query: string,
): Promise<T | undefined> {
  const res = await request.get(`/api/${collection}?${query}&limit=1&depth=0`, {
    headers: authHeaders(token),
  })
  const body = (await res.json().catch(() => ({}))) as { docs?: T[] }
  return body.docs?.[0]
}

async function siteId(request: APIRequestContext, token: string, code: string): Promise<number> {
  const doc = await findOne<{ id: number }>(
    request,
    token,
    'sites',
    `where[siteId][equals]=${code}`,
  )
  if (!doc) {
    throw new Error(`[e2e-setup] site "${code}" not found — is the DB seeded?`)
  }
  return doc.id
}

/** Resolves the adminMenus doc ids for a set of menuKeys (only those that exist). */
async function resolveMenuGrantIds(
  request: APIRequestContext,
  token: string,
  menuKeys: string[],
): Promise<number[]> {
  const params = menuKeys
    .map((k, i) => `where[menuKey][in][${i}]=${encodeURIComponent(k)}`)
    .join('&')
  const res = await request.get(`/api/adminMenus?${params}&limit=300&depth=0`, {
    headers: authHeaders(token),
  })
  const body = (await res.json().catch(() => ({}))) as { docs?: { id: number }[] }
  return (body.docs ?? []).map((d) => d.id)
}

/** Ensures a role exists (by roleId); returns its db id. */
async function ensureRole(
  request: APIRequestContext,
  token: string,
  roleId: string,
  name: string,
  menuGrants: number[],
): Promise<number> {
  const existing = await findOne<{ id: number }>(
    request,
    token,
    'roles',
    `where[roleId][equals]=${roleId}`,
  )
  if (existing) {
    return existing.id
  }
  const res = await request.post('/api/roles', {
    headers: authHeaders(token),
    data: { roleId, name, description: `${name} (e2e)`, isSuper: false, menuGrants },
  })
  const body = (await res.json().catch(() => ({}))) as { doc?: { id: number }; errors?: unknown }
  if (!res.ok() || !body.doc) {
    throw new Error(
      `[e2e-setup] create role ${roleId} failed: ${res.status()} ${JSON.stringify(body)}`,
    )
  }
  return body.doc.id
}

/** Ensures an e2e admin exists (by email); returns its db id. */
async function ensureAdmin(
  request: APIRequestContext,
  token: string,
  admin: { email: string; loginId: string; password: string },
  roleDbId: number,
  tenantId?: number,
): Promise<number> {
  const existing = await findOne<{ id: number }>(
    request,
    token,
    'users',
    `where[email][equals]=${encodeURIComponent(admin.email)}`,
  )
  if (existing) {
    return existing.id
  }
  const res = await request.post('/api/users', {
    headers: authHeaders(token),
    data: {
      email: admin.email,
      loginId: admin.loginId,
      name: admin.loginId,
      password: admin.password,
      status: 'active',
      roles: [roleDbId],
      ...(tenantId !== undefined ? { tenants: [{ tenant: tenantId }] } : {}),
    },
  })
  const body = (await res.json().catch(() => ({}))) as { doc?: { id: number }; errors?: unknown }
  if (!res.ok() || !body.doc) {
    throw new Error(
      `[e2e-setup] create admin ${admin.email} failed: ${res.status()} ${JSON.stringify(body)}`,
    )
  }
  return body.doc.id
}

async function boardId(
  request: APIRequestContext,
  token: string,
  demoSiteId: number,
  clause: string,
): Promise<{ id: number; name: string; bbsId: string } | undefined> {
  return findOne(request, token, 'boards', `where[and][0][tenant][equals]=${demoSiteId}&${clause}`)
}

/**
 * Provisions all authenticated e2e state and captures the fixtures. Returns the
 * fixtures (also written to FIXTURES_PATH for the spec files to read).
 */
export async function provisionE2e(request: APIRequestContext): Promise<E2eFixtures> {
  // 1) Log in as the REAL seeded super-admin (left un-enrolled → no OTP needed).
  const superToken = await apiLogin(request, SEED_SUPER.email, SEED_SUPER.password)

  // 2) Resolve site ids.
  const demoSiteId = await siteId(request, superToken, 'demo')
  const bosSiteId = await siteId(request, superToken, 'bos')

  // 3) Turn 2FA ON for the admin back-office.
  const twoFa = await request.patch(`/api/sites/${bosSiteId}`, {
    headers: authHeaders(superToken),
    data: { twoFactorEnabled: true },
  })
  expect(twoFa.ok(), `enable 2FA on bos site: ${twoFa.status()}`).toBeTruthy()

  // 4) Ensure the two non-super roles exist.
  const roleDbIdByRoleId = new Map<string, number>()
  for (const role of ROLES_TO_ENSURE) {
    const grants = await resolveMenuGrantIds(request, superToken, role.menuKeys)
    const id = await ensureRole(request, superToken, role.value, role.value, grants)
    roleDbIdByRoleId.set(role.value, id)
  }
  const privacyRole = await findOne<{ id: number }>(
    request,
    superToken,
    'roles',
    `where[roleId][equals]=${E2E_PRIVACY.roleId}`,
  )
  const adminRole = await findOne<{ id: number }>(
    request,
    superToken,
    'roles',
    `where[roleId][equals]=${E2E_SUPER.roleId}`,
  )
  if (!privacyRole || !adminRole) {
    throw new Error('[e2e-setup] ROLE_PRIVACY_OFFICER / ROLE_ADMIN not found — is the DB seeded?')
  }
  roleDbIdByRoleId.set(E2E_PRIVACY.roleId, privacyRole.id)
  roleDbIdByRoleId.set(E2E_SUPER.roleId, adminRole.id)

  // 5) Ensure the e2e admins. content + privacy get the demo tenant so their
  //    per-user tenant scope is non-empty (super bypasses tenant scoping).
  const superAdminId = await ensureAdmin(
    request,
    superToken,
    E2E_SUPER,
    roleDbIdByRoleId.get(E2E_SUPER.roleId)!,
  )
  await ensureAdmin(
    request,
    superToken,
    E2E_CONTENT,
    roleDbIdByRoleId.get(E2E_CONTENT.roleId)!,
    demoSiteId,
  )
  await ensureAdmin(
    request,
    superToken,
    E2E_PRIVACY,
    roleDbIdByRoleId.get(E2E_PRIVACY.roleId)!,
    demoSiteId,
  )
  await ensureAdmin(request, superToken, E2E_STATS, roleDbIdByRoleId.get(E2E_STATS.roleId)!)

  // 6) Enrol e2e-super with a fresh TOTP secret via the REAL enrolment flow.
  //    Reset any prior enrolment first so this is idempotent across re-runs.
  const reset = await request.patch(`/api/users/${superAdminId}`, {
    headers: authHeaders(superToken),
    data: { resetTwoFactorDevice: true },
  })
  expect(reset.ok(), `reset e2e-super 2FA: ${reset.status()}`).toBeTruthy()

  const e2eSuperToken = await apiLogin(request, E2E_SUPER.email, E2E_SUPER.password)
  const enroll = await request.post('/api/2fa/enroll', { headers: authHeaders(e2eSuperToken) })
  const enrollBody = (await enroll.json().catch(() => ({}))) as { secret?: string }
  if (!enroll.ok() || !enrollBody.secret) {
    throw new Error(
      `[e2e-setup] 2FA enroll failed: ${enroll.status()} ${JSON.stringify(enrollBody)}`,
    )
  }
  const superTotpSecret = enrollBody.secret
  const verify = await request.post('/api/2fa/verify-enroll', {
    headers: authHeaders(e2eSuperToken),
    data: { token: authenticator.generate(superTotpSecret) },
  })
  expect(verify.ok(), `2FA verify-enroll: ${verify.status()} ${await verify.text()}`).toBeTruthy()

  // 7) Capture the seeded board ids the suites need (canonical names — the demo
  //    tenant is polluted by prior int-test runs, so match by exact name).
  const secBoard = await boardId(
    request,
    superToken,
    demoSiteId,
    `where[and][1][name][equals]=${encodeURIComponent('Security Education')}&where[and][2][securityDoc][equals]=true`,
  )
  const qnaBoard = await boardId(
    request,
    superToken,
    demoSiteId,
    `where[and][1][name][equals]=${encodeURIComponent('Q&A')}`,
  )
  const noticeBoard = await boardId(
    request,
    superToken,
    demoSiteId,
    `where[and][1][name][equals]=${encodeURIComponent('Notice')}`,
  )
  if (!secBoard || !qnaBoard || !noticeBoard) {
    throw new Error(
      `[e2e-setup] seeded boards missing (sec=${!!secBoard} qna=${!!qnaBoard} notice=${!!noticeBoard})`,
    )
  }

  // Enable member posting on the Q&A board so the member-ask flow has a form.
  const qnaPatch = await request.patch(`/api/boards/${qnaBoard.id}`, {
    headers: authHeaders(superToken),
    data: { userPostAllowed: true },
  })
  expect(qnaPatch.ok(), `enable Q&A user posting: ${qnaPatch.status()}`).toBeTruthy()

  // The seeded active demo member (for the member-privacy-gate suite).
  const demoMember = await findOne<{ id: number }>(
    request,
    superToken,
    'members',
    `where[email][equals]=${encodeURIComponent('member@demo.example.com')}`,
  )
  if (!demoMember) {
    throw new Error(
      '[e2e-setup] demo member (member@demo.example.com) not found — is the DB seeded?',
    )
  }

  const fixtures: E2eFixtures = {
    demoSiteId,
    bosSiteId,
    securityDocBoardId: secBoard.id,
    securityDocBoardName: secBoard.name,
    qnaBoardId: qnaBoard.id,
    qnaBoardBbsId: qnaBoard.bbsId,
    noticeBoardId: noticeBoard.id,
    noticeBoardBbsId: noticeBoard.bbsId,
    demoMemberId: demoMember.id,
    superTotpSecret,
  }
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2))
  return fixtures
}
