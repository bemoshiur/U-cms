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
import { throttleTwoFactorFailure } from '@/auth/twoFactorHooks'
import { TWO_FACTOR_MAX_ATTEMPTS } from '@/auth/twoFactor'
import {
  TWO_FACTOR_INVALID_MESSAGE,
  TWO_FACTOR_LOCKED_MESSAGE,
  TWO_FACTOR_REQUIRED_MESSAGE,
} from '@/auth/twoFactorMessages'
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
  // A real `req.user` ALWAYS carries its auth-collection slug (`users` for the
  // back-office, `members` for the public site). Synthetic users default to the
  // `users` collection; a member test passes `collection: 'members'` explicitly.
  const withCollection =
    user && typeof user === 'object'
      ? { collection: 'users', ...(user as Record<string, unknown>) }
      : user
  return {
    payload,
    user: withCollection,
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

/** Simulates one wrong-OTP login failure hitting the afterError throttle hook. */
async function throttleWrongOtp(email: string): Promise<void> {
  await throttleTwoFactorFailure({
    collection: { slug: 'users' },
    error: new Error(TWO_FACTOR_INVALID_MESSAGE),
    req: {
      payload,
      pathname: '/api/users/login',
      headers: new Headers(),
      data: { email },
      context: {},
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

/**
 * Upper-cases every other letter of an (already-lowercased) email so the result
 * DIFFERS from the stored value but still `.toLowerCase()`s back to it — the
 * `Admin@Example.com` shape that the B1 case-bypass exploits.
 */
function toMixedCase(email: string): string {
  let flip = false
  return email.replace(/[a-z]/g, (ch) => {
    flip = !flip
    return flip ? ch.toUpperCase() : ch
  })
}

/** Wrong 6-digit code derived from a valid one (never collides with it). */
function wrongCode(secret: string): string {
  const valid = authenticator.generate(secret)
  return String((Number(valid) + 1) % 1_000_000).padStart(6, '0')
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

  describe('Part 2b — B1 collection gate (a member session cannot touch admin 2FA)', () => {
    it('B1 regression — enroll AND verify-enroll refuse a member session; no TOTP written to an id-colliding admin', async () => {
      await setTwoFactor(true)

      // A back-office admin whose users-row id a member id can collide with.
      const admin = await createActiveUser('b1admin')

      // A REAL public-site member (Task 4B auth collection). Its id sequence is
      // independent of `users`, so this exercises the exact escalation: a member
      // session whose id collides with the admin's users-row id. `loadSelf`
      // resolves `req.user.id` against `users`, so an un-gated member request
      // would findByID (and write TOTP onto) the id-colliding ADMIN row.
      const publicSite = await payload.create({
        collection: 'sites',
        data: {
          siteId: uniqueSiteId('b1pub'),
          name: 'B1 Public Site',
          url: 'https://b1.example.com',
          isAdminSite: false,
        },
        overrideAccess: true,
      })
      const member = await payload.create({
        collection: 'members',
        data: {
          loginId: `b1m${Date.now()}`.toLowerCase(),
          email: uniqueEmail('b1member'),
          name: 'B1 Member',
          password: 'Member-Pass-99',
          status: 'active',
          tenant: publicSite.id,
        } as never,
        overrideAccess: true,
      })

      // The attacker's member session, carrying the admin's colliding id.
      const attacker = { ...member, id: admin.id, collection: 'members' as const }

      const enroll = await callEnroll(attacker)
      expect([401, 403]).toContain(enroll.status)
      const verify = await callVerifyEnroll(attacker, '000000')
      expect([401, 403]).toContain(verify.status)

      // The admin row is untouched — WITHOUT the fix, the enroll above would have
      // minted + written a TOTP secret onto this id-colliding admin row (and the
      // verify would have returned 400, not 401/403).
      const target = await serverRead(admin.id)
      expect((target as { totpSecret?: string | null }).totpSecret).toBeFalsy()
      expect(target.totpConfirmed).toBeFalsy()

      // Belt: a member session on its OWN id is refused too.
      const own = { ...member, collection: 'members' as const }
      expect([401, 403]).toContain((await callEnroll(own)).status)
      expect([401, 403]).toContain((await callVerifyEnroll(own, '000000')).status)
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

  describe('Part 6 — OTP brute-force throttle', () => {
    it('locks the OTP step after N wrong codes, refusing even a correct code, and audits the lock', async () => {
      await setTwoFactor(true)
      const { user, secret } = await setupConfirmedUser('throttlelock')

      for (let i = 0; i < TWO_FACTOR_MAX_ATTEMPTS; i++) {
        await throttleWrongOtp(user.email)
      }

      const locked = await serverRead(user.id)
      expect(locked.totpFailedAttempts).toBe(TWO_FACTOR_MAX_ATTEMPTS)
      expect(locked.totpLockUntil).toBeTruthy()
      expect(new Date(locked.totpLockUntil as string).getTime()).toBeGreaterThan(Date.now())

      // Even a CORRECT code is refused while locked.
      await expect(
        payload.login({
          collection: 'users',
          data: { email: user.email, password: STRONG_PW },
          req: { data: { otp: authenticator.generate(secret) } },
        } as Parameters<typeof payload.login>[0]),
      ).rejects.toThrow(TWO_FACTOR_LOCKED_MESSAGE)

      // The lock event is audited.
      const logs = await payload.find({
        collection: 'accessLogs',
        where: { menuLabel: { like: 'OTP step locked' } },
        overrideAccess: true,
        pagination: false,
      })
      expect(logs.docs.length).toBeGreaterThanOrEqual(1)
    })

    it('a successful code before the threshold resets the failed-attempt counter', async () => {
      await setTwoFactor(true)
      const { user, secret } = await setupConfirmedUser('throttlereset')

      for (let i = 0; i < TWO_FACTOR_MAX_ATTEMPTS - 2; i++) {
        await throttleWrongOtp(user.email)
      }
      expect((await serverRead(user.id)).totpFailedAttempts).toBe(TWO_FACTOR_MAX_ATTEMPTS - 2)

      const ok = await payload.login({
        collection: 'users',
        data: { email: user.email, password: STRONG_PW },
        req: { data: { otp: authenticator.generate(secret) } },
      } as Parameters<typeof payload.login>[0])
      expect(ok.token).toBeTruthy()

      const after = await serverRead(user.id)
      expect(after.totpFailedAttempts).toBe(0)
      expect(after.totpLockUntil).toBeFalsy()
    })

    it('B1 regression — a MIXED-CASE email cannot bypass the throttle (drives the real login path, no pre-seeding)', async () => {
      await setTwoFactor(true)
      const { user, secret } = await setupConfirmedUser('mixedcasebypass')

      // The stored email is lowercased; the attacker submits a mixed-case
      // variant that still resolves to the same account at login.
      const mixed = toMixedCase(user.email)
      expect(mixed).not.toBe(user.email) // genuinely mixed
      expect(mixed.toLowerCase()).toBe(user.email) // still the same account

      // Drive TWO_FACTOR_MAX_ATTEMPTS wrong-OTP logins END TO END with the
      // mixed-case email: each real login rejects the wrong code, then the
      // afterError throttle hook runs with the SAME mixed-case identifier the
      // HTTP router passes (req.data.email) — NOT a pre-seeded counter. Without
      // the fix the case-sensitive lookup matches no row, so nothing is written.
      for (let i = 0; i < TWO_FACTOR_MAX_ATTEMPTS; i++) {
        await expect(
          payload.login({
            collection: 'users',
            data: { email: mixed, password: STRONG_PW },
            req: { data: { otp: wrongCode(secret) } },
          } as Parameters<typeof payload.login>[0]),
        ).rejects.toThrow(TWO_FACTOR_INVALID_MESSAGE)
        await throttleWrongOtp(mixed)
      }

      // The throttle must have engaged on the real (lowercased) row.
      const locked = await serverRead(user.id)
      expect(locked.totpFailedAttempts).toBe(TWO_FACTOR_MAX_ATTEMPTS)
      expect(locked.totpLockUntil).toBeTruthy()
      expect(new Date(locked.totpLockUntil as string).getTime()).toBeGreaterThan(Date.now())

      // 6th attempt with a CORRECT code (still mixed-case email) is refused by
      // the lock — the assertion that fails WITHOUT the fix (login would succeed).
      await expect(
        payload.login({
          collection: 'users',
          data: { email: mixed, password: STRONG_PW },
          req: { data: { otp: authenticator.generate(secret) } },
        } as Parameters<typeof payload.login>[0]),
      ).rejects.toThrow(TWO_FACTOR_LOCKED_MESSAGE)
    })

    it('an expired lock lets a valid code through again (never permanently locked)', async () => {
      await setTwoFactor(true)
      const { user, secret } = await setupConfirmedUser('throttleexpire')

      // Simulate a lock that has already elapsed.
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          totpFailedAttempts: TWO_FACTOR_MAX_ATTEMPTS,
          totpLockUntil: new Date(Date.now() - 1000).toISOString(),
        },
        overrideAccess: true,
      })

      const ok = await payload.login({
        collection: 'users',
        data: { email: user.email, password: STRONG_PW },
        req: { data: { otp: authenticator.generate(secret) } },
      } as Parameters<typeof payload.login>[0])
      expect(ok.token).toBeTruthy()
      expect((await serverRead(user.id)).totpFailedAttempts).toBe(0)
    })
  })
})
