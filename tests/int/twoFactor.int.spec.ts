import { authenticator } from 'otplib'
import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { recordLoginFailure } from '@/audit/authHooks'
import {
  enrollTwoFactorEndpoint,
  verifyEnrollTwoFactorEndpoint,
} from '@/endpoints/twoFactorEndpoints'
import { TWO_FACTOR_INVALID_MESSAGE, TWO_FACTOR_REQUIRED_MESSAGE } from '@/auth/twoFactorMessages'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'

let payload: Payload
let twoFactorSiteId: number | string

const STRONG_PW = 'Vault7-mkpqz'
const MAILPIT_API_URL = process.env.MAILPIT_API_URL || 'http://localhost:8025'

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 100000)}`
}
function uniqueEmail(label: string): string {
  return `${unique(label)}@example.com`.toLowerCase()
}
function uniqueSiteId(label: string): string {
  return `s${label}${Math.floor(Math.random() * 1_000_000)}`.toLowerCase().replace(/[^a-z0-9]/g, '')
}

type MailpitSummary = { ID: string; Subject: string; To: { Address: string }[] }
async function pollMailpitTo(
  email: string,
  attempts = 20,
  delayMs = 250,
): Promise<MailpitSummary[]> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(
      `${MAILPIT_API_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    )
    if (res.ok) {
      const data = (await res.json()) as { messages?: MailpitSummary[] }
      const messages = (data.messages ?? []).filter((m) =>
        m.To?.some((t) => t.Address.toLowerCase() === email.toLowerCase()),
      )
      if (messages.length > 0) return messages
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return []
}

/** Turns the back-office 2FA requirement on/off deterministically. */
async function setTwoFactor(enabled: boolean): Promise<void> {
  const admins = await payload.find({
    collection: 'sites',
    where: { and: [{ isAdminSite: { equals: true } }, { twoFactorEnabled: { equals: true } }] },
    pagination: false,
    overrideAccess: true,
  })
  for (const site of admins.docs) {
    if (site.id !== twoFactorSiteId) {
      await payload.update({
        collection: 'sites',
        id: site.id,
        data: { twoFactorEnabled: false },
        overrideAccess: true,
      })
    }
  }
  await payload.update({
    collection: 'sites',
    id: twoFactorSiteId,
    data: { twoFactorEnabled: enabled },
    overrideAccess: true,
  })
}

/** Minimal PayloadRequest for driving an endpoint handler directly. */
function endpointReq(user: unknown, body?: Record<string, unknown>): PayloadRequest {
  return {
    payload,
    user,
    context: {},
    pathname: '/api/2fa/test',
    headers: new Headers(),
    json: async () => body ?? {},
  } as unknown as PayloadRequest
}

async function callEnroll(
  user: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await enrollTwoFactorEndpoint.handler(endpointReq(user))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}
async function callVerifyEnroll(
  user: unknown,
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await verifyEnrollTwoFactorEndpoint.handler(endpointReq(user, { token }))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function createActiveUser(label: string) {
  return payload.create({
    collection: 'users',
    data: { email: uniqueEmail(label), password: STRONG_PW, status: 'active', name: label },
    overrideAccess: true,
  })
}

/** Enrols + confirms a user through the real endpoints; returns the secret. */
async function setupConfirmedUser(label: string) {
  const user = await createActiveUser(label)
  const enroll = await callEnroll(user)
  const secret = enroll.body.secret as string
  const confirm = await callVerifyEnroll(user, authenticator.generate(secret))
  expect(confirm.status).toBe(200)
  return { user, secret }
}

async function serverRead(id: number | string) {
  return payload.findByID({ collection: 'users', id, overrideAccess: true, showHiddenFields: true })
}

describe('Google-OTP 2FA + session revocation (Task 2B)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, rolesStep, superAdminStep])
    const site = await payload.create({
      collection: 'sites',
      data: {
        siteId: uniqueSiteId('2fa'),
        name: '2FA Admin Site',
        url: 'https://example.com',
        isAdminSite: true,
        twoFactorEnabled: false,
      },
      overrideAccess: true,
    })
    twoFactorSiteId = site.id
  })

  describe('Part 1 — secret storage never leaks to clients', () => {
    it('stores totpSecret hidden from client reads but readable server-side', async () => {
      await setTwoFactor(true)
      const user = await createActiveUser('leak')
      const enroll = await callEnroll(user)
      expect(enroll.status).toBe(200)
      const secret = enroll.body.secret as string
      expect(secret).toBeTruthy()

      // Self read (as the user, no override) — secret must be absent.
      const selfRead = await payload.find({
        collection: 'users',
        where: { id: { equals: user.id } },
        user,
        overrideAccess: false,
      })
      expect(selfRead.docs[0]).toBeDefined()
      expect(selfRead.docs[0]).not.toHaveProperty('totpSecret')

      // List read — no row exposes the secret.
      const listRead = await payload.find({
        collection: 'users',
        user,
        overrideAccess: false,
        limit: 20,
      })
      expect(listRead.docs.every((d) => !('totpSecret' in d))).toBe(true)

      // Server (override + hidden) read — the secret IS stored.
      const server = await serverRead(user.id)
      expect((server as { totpSecret?: string }).totpSecret).toBe(secret)
    })
  })

  describe('Part 2 — enrolment (QR once) + verify', () => {
    it('returns a secret + QR on first enroll, and never re-leaks it after confirmation', async () => {
      await setTwoFactor(true)
      const user = await createActiveUser('enroll')

      const first = await callEnroll(user)
      expect(first.status).toBe(200)
      expect(first.body.secret).toBeTruthy()
      expect(String(first.body.qrDataUrl)).toMatch(/^data:image\/png;base64,/)
      expect(String(first.body.otpauthUri)).toContain('otpauth://totp/')

      // Confirm with a valid code.
      const secret = first.body.secret as string
      const confirm = await callVerifyEnroll(user, authenticator.generate(secret))
      expect(confirm.status).toBe(200)
      expect((await serverRead(user.id)).totpConfirmed).toBe(true)
      expect((await serverRead(user.id)).totpEnrolledAt).toBeTruthy()

      // Second enroll after confirmation — no secret returned.
      const again = await callEnroll(user)
      expect(again.status).toBe(200)
      expect(again.body.alreadyEnrolled).toBe(true)
      expect(again.body.secret).toBeUndefined()
    })

    it('verify-enroll rejects a wrong code and never confirms it', async () => {
      await setTwoFactor(true)
      const user = await createActiveUser('badcode')
      const enroll = await callEnroll(user)
      const secret = enroll.body.secret as string
      const valid = authenticator.generate(secret)
      const wrong = String((Number(valid) + 1) % 1_000_000).padStart(6, '0')

      const res = await callVerifyEnroll(user, wrong)
      expect(res.status).toBe(400)
      expect((await serverRead(user.id)).totpConfirmed).toBeFalsy()
    })

    it('rejects enrolment when the site does not require 2FA', async () => {
      await setTwoFactor(false)
      const user = await createActiveUser('no2fa-enroll')
      const res = await callEnroll(user)
      expect(res.status).toBe(400)
    })
  })

  describe('Part 3 — login gate', () => {
    it('logs in normally when 2FA is not required', async () => {
      await setTwoFactor(false)
      const email = uniqueEmail('plainlogin')
      await payload.create({
        collection: 'users',
        data: { email, password: STRONG_PW, status: 'active' },
        overrideAccess: true,
      })
      const res = await payload.login({ collection: 'users', data: { email, password: STRONG_PW } })
      expect(res.token).toBeTruthy()
    })

    it('allows first login for a required-but-not-yet-enrolled user (enrolment path)', async () => {
      await setTwoFactor(true)
      const email = uniqueEmail('firstlogin')
      await payload.create({
        collection: 'users',
        data: { email, password: STRONG_PW, status: 'active' },
        overrideAccess: true,
      })
      const res = await payload.login({ collection: 'users', data: { email, password: STRONG_PW } })
      expect(res.token).toBeTruthy()
    })

    it('requires a valid OTP once enrolled: no code rejected, valid code accepted', async () => {
      await setTwoFactor(true)
      const email = uniqueEmail('otplogin')
      const user = await payload.create({
        collection: 'users',
        data: { email, password: STRONG_PW, status: 'active' },
        overrideAccess: true,
      })
      const enroll = await callEnroll(user)
      const secret = enroll.body.secret as string
      await callVerifyEnroll(user, authenticator.generate(secret))

      // Step 1: password only → gate demands a code.
      await expect(
        payload.login({ collection: 'users', data: { email, password: STRONG_PW } }),
      ).rejects.toThrow(TWO_FACTOR_REQUIRED_MESSAGE)

      // Step 2: password + valid code → session issued.
      const ok = await payload.login({
        collection: 'users',
        data: { email, password: STRONG_PW },
        req: { data: { otp: authenticator.generate(secret) } },
      } as Parameters<typeof payload.login>[0])
      expect(ok.token).toBeTruthy()
    })

    it('rejects a wrong OTP and issues no session', async () => {
      await setTwoFactor(true)
      const email = uniqueEmail('wrongotp')
      const user = await payload.create({
        collection: 'users',
        data: { email, password: STRONG_PW, status: 'active' },
        overrideAccess: true,
      })
      const enroll = await callEnroll(user)
      const secret = enroll.body.secret as string
      await callVerifyEnroll(user, authenticator.generate(secret))

      const valid = authenticator.generate(secret)
      const wrong = String((Number(valid) + 1) % 1_000_000).padStart(6, '0')
      await expect(
        payload.login({
          collection: 'users',
          data: { email, password: STRONG_PW },
          req: { data: { otp: wrong } },
        } as Parameters<typeof payload.login>[0]),
      ).rejects.toThrow(TWO_FACTOR_INVALID_MESSAGE)
    })

    it('does NOT audit the benign "code required" step, but DOES audit a wrong code', async () => {
      // The failed-login audit runs on the HTTP afterError seam; drive it
      // directly (T2A pattern) to prove the skip flag behaviour.
      const attempted = uniqueEmail('auditskip')
      // 2FA-required intermediate: flagged → no row.
      await recordLoginFailure({
        collection: { slug: 'users' },
        error: new Error(TWO_FACTOR_REQUIRED_MESSAGE),
        req: {
          payload,
          pathname: '/api/users/login',
          headers: new Headers(),
          data: { email: attempted },
          context: { skipTwoFactorFailureLog: true },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      let rows = await payload.find({
        collection: 'loginHistory',
        where: { loginId: { equals: attempted } },
        overrideAccess: true,
      })
      expect(rows.docs).toHaveLength(0)

      // Wrong-code failure: not flagged → recorded.
      await recordLoginFailure({
        collection: { slug: 'users' },
        error: new Error(TWO_FACTOR_INVALID_MESSAGE),
        req: {
          payload,
          pathname: '/api/users/login',
          headers: new Headers(),
          data: { email: attempted },
          context: {},
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      rows = await payload.find({
        collection: 'loginHistory',
        where: { loginId: { equals: attempted } },
        overrideAccess: true,
      })
      expect(rows.docs).toHaveLength(1)
      expect(rows.docs[0]!.success).toBe(false)
      expect(rows.docs[0]!.failReason).toContain('one-time')
    })
  })

  describe('Part 4 — admin reset', () => {
    it('an admin reset clears enrolment, emails the user, and audits it', async () => {
      await setTwoFactor(true)
      const { user } = await setupConfirmedUser('resetdevice')

      // A real super-admin performs the reset WITHOUT overrideAccess — proving
      // the field-access-locked TOTP fields are still cleared by the hook.
      const superRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_2FA_${unique('S').toUpperCase()}`,
          name: 'S',
          description: 'x',
          isSuper: true,
        },
        overrideAccess: true,
      })
      const admin = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('resetadmin'),
          password: STRONG_PW,
          status: 'active',
          roles: [superRole.id],
        },
        overrideAccess: true,
      })

      await payload.update({
        collection: 'users',
        id: user.id,
        data: { resetTwoFactorDevice: true },
        user: admin,
        overrideAccess: false,
      })

      const after = await serverRead(user.id)
      expect(after.totpConfirmed).toBeFalsy()
      expect((after as { totpSecret?: string | null }).totpSecret).toBeFalsy()
      expect(after.totpEnrolledAt).toBeFalsy()
      expect(after.resetTwoFactorDevice).toBe(false)

      const messages = await pollMailpitTo(user.email)
      expect(messages.some((m) => /two-factor/i.test(m.Subject))).toBe(true)

      const logs = await payload.find({
        collection: 'accessLogs',
        where: { menuLabel: { like: 'device reset' } },
        overrideAccess: true,
        pagination: false,
      })
      expect(logs.docs.length).toBeGreaterThanOrEqual(1)
    })

    it('regenerate secret issues a fresh secret and forces re-enrolment', async () => {
      await setTwoFactor(true)
      const { user, secret } = await setupConfirmedUser('regen')
      await payload.update({
        collection: 'users',
        id: user.id,
        data: { regenerateTwoFactorSecret: true },
        overrideAccess: true,
      })
      const after = await serverRead(user.id)
      expect(after.totpConfirmed).toBeFalsy()
      const newSecret = (after as { totpSecret?: string | null }).totpSecret
      expect(newSecret).toBeTruthy()
      expect(newSecret).not.toBe(secret)
    })

    it('a non-admin cannot trigger a reset on their own account (field gate)', async () => {
      await setTwoFactor(true)
      const { user } = await setupConfirmedUser('selfnoreset')
      // Self update of the admin-only action checkbox — the field is stripped
      // by field access, so the reset never runs.
      await payload.update({
        collection: 'users',
        id: user.id,
        data: { resetTwoFactorDevice: true },
        user,
        overrideAccess: false,
      })
      expect((await serverRead(user.id)).totpConfirmed).toBe(true)
    })
  })

  describe('Part 5 — carried I-2: session revocation on status change', () => {
    it('clears sessions and blocks further auth when status flips to non-active', async () => {
      await setTwoFactor(false)
      const email = uniqueEmail('revoke')
      const user = await payload.create({
        collection: 'users',
        data: { email, password: STRONG_PW, status: 'active', name: 'Revoke Me' },
        overrideAccess: true,
      })

      const login = await payload.login({
        collection: 'users',
        data: { email, password: STRONG_PW },
      })
      const token = login.token as string
      const headers = new Headers({ Authorization: `JWT ${token}` })

      // Authenticated before revocation.
      const before = await payload.auth({ headers })
      expect(before.user?.id).toBe(user.id)
      expect(((await serverRead(user.id)).sessions ?? []).length).toBeGreaterThan(0)

      // Admin flips status to locked → sessions revoked in the same write.
      await payload.update({
        collection: 'users',
        id: user.id,
        data: { status: 'locked' },
        overrideAccess: true,
      })
      expect((await serverRead(user.id)).sessions ?? []).toHaveLength(0)

      // The previously-valid token no longer authenticates (JWT refresh bypass closed).
      const after = await payload.auth({ headers })
      expect(after.user).toBeNull()

      // Forced logout audited.
      const logs = await payload.find({
        collection: 'accessLogs',
        where: {
          and: [{ action: { equals: 'logout' } }, { menuLabel: { like: 'Forced logout' } }],
        },
        overrideAccess: true,
        pagination: false,
      })
      expect(logs.docs.length).toBeGreaterThanOrEqual(1)
    })
  })
})
