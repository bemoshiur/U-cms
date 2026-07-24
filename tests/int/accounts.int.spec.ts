import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { ROLE_ADMIN_ROLE_ID, rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'
import { AccountRequestError, submitAccountRequest } from '@/accounts/accountRequest'
import {
  GENERIC_FIND_ID_MESSAGE,
  GENERIC_FIND_PASSWORD_MESSAGE,
  findId,
  findPassword,
} from '@/accounts/recovery'
import { markDormantAccounts } from '@/accounts/dormancy'

let payload: Payload

const MAILPIT_API_URL = process.env.MAILPIT_API_URL || 'http://localhost:8025'

/** Strong password satisfying the policy: 3 classes, 12 chars, no sequence. */
const STRONG_PW = 'Vault7-mkpqz'

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 10000)}`
}
function uniqueEmail(label: string): string {
  return `${unique(label)}@example.com`
}
/** Matches the loginId field validator: lowercase alnum + . _ - , 4+ chars. */
function uniqueLoginId(label: string): string {
  return unique(label).toLowerCase()
}

type MailpitSummary = {
  ID: string
  Subject: string
  To: { Address: string; Name: string }[]
}

/** Polls Mailpit for messages addressed to `email` (search API). */
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

async function roleAdminId(): Promise<number> {
  const found = await payload.find({
    collection: 'roles',
    where: { roleId: { equals: ROLE_ADMIN_ROLE_ID } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (typeof id !== 'number') throw new Error('ROLE_ADMIN not found — did the roles seed run?')
  return id
}

/**
 * Ensures a dedicated admin site exists and sets its `accountApplicationEnabled`
 * flag. Also disables the flag on every OTHER admin site so the global
 * "applications enabled" check is deterministic for the toggle tests.
 */
async function setAccountApplication(enabled: boolean): Promise<void> {
  const admins = await payload.find({
    collection: 'sites',
    where: { isAdminSite: { equals: true } },
    pagination: false,
    overrideAccess: true,
  })
  for (const site of admins.docs) {
    if (site.accountApplicationEnabled) {
      await payload.update({
        collection: 'sites',
        id: site.id,
        data: { accountApplicationEnabled: false },
        overrideAccess: true,
      })
    }
  }
  if (enabled) {
    await payload.create({
      collection: 'sites',
      data: {
        siteId: uniqueLoginId('adminsite'),
        name: 'Test Admin Site',
        url: 'https://example.com',
        isAdminSite: true,
        accountApplicationEnabled: true,
      },
      overrideAccess: true,
    })
  }
}

describe('admin account lifecycle (Task 1D)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, rolesStep, superAdminStep])
  })

  describe('password policy enforcement (wired via beforeValidate hook)', () => {
    it('rejects a too-short 2-class password on create', async () => {
      await expect(
        payload.create({
          collection: 'users',
          data: { email: uniqueEmail('pw'), password: 'short1a', status: 'active' },
          overrideAccess: true,
        }),
      ).rejects.toThrow(/at least 10 characters/i)
    })

    it('rejects a sequence password on create', async () => {
      await expect(
        payload.create({
          collection: 'users',
          data: { email: uniqueEmail('pw'), password: 'mxkpvh1234', status: 'active' },
          overrideAccess: true,
        }),
      ).rejects.toThrow(/sequences/i)
    })

    it('rejects a password containing the login ID on create', async () => {
      // Fixed (non-timestamp) login ID so the login-ID rule is what triggers,
      // not an incidental digit sequence from a timestamp. The create is
      // expected to REJECT, so nothing is persisted and uniqueness is moot.
      const loginId = 'johnsmith'
      await expect(
        payload.create({
          collection: 'users',
          data: {
            email: uniqueEmail('pw'),
            loginId,
            password: `x9!${loginId}Z`,
            status: 'active',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow(/login id/i)
    })

    it('accepts a valid password, and enforces the policy on password UPDATE too', async () => {
      const user = await payload.create({
        collection: 'users',
        data: { email: uniqueEmail('pw'), password: STRONG_PW, status: 'active' },
        overrideAccess: true,
      })
      expect(user.id).toBeDefined()

      await expect(
        payload.update({
          collection: 'users',
          id: user.id,
          data: { password: 'weak' },
          overrideAccess: true,
        }),
      ).rejects.toThrow(/at least/i)
    })
  })

  describe('login status gate (beforeLogin)', () => {
    async function makeUser(status: 'pending' | 'active' | 'dormant' | 'locked') {
      const email = uniqueEmail(`login-${status}`)
      await payload.create({
        collection: 'users',
        data: { email, password: STRONG_PW, status },
        overrideAccess: true,
      })
      return email
    }

    it('blocks a pending account with an approval message', async () => {
      const email = await makeUser('pending')
      await expect(
        payload.login({ collection: 'users', data: { email, password: STRONG_PW } }),
      ).rejects.toThrow(/awaiting administrator approval/i)
    })

    it('blocks a dormant account with an inactivity message', async () => {
      const email = await makeUser('dormant')
      await expect(
        payload.login({ collection: 'users', data: { email, password: STRONG_PW } }),
      ).rejects.toThrow(/dormant due to inactivity/i)
    })

    it('blocks a locked account', async () => {
      const email = await makeUser('locked')
      await expect(
        payload.login({ collection: 'users', data: { email, password: STRONG_PW } }),
      ).rejects.toThrow(/locked/i)
    })

    it('allows an active account and stamps lastLoginAt', async () => {
      const email = await makeUser('active')
      const result = await payload.login({
        collection: 'users',
        data: { email, password: STRONG_PW },
      })
      expect(result.token).toBeTruthy()

      const reloaded = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      expect(reloaded.docs[0]?.lastLoginAt).toBeTruthy()
    })
  })

  describe('self cannot change own status (regression, like T1C roles)', () => {
    it('drops a self-submitted status change while applying other fields', async () => {
      const user = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('selfstatus'),
          password: STRONG_PW,
          status: 'pending',
          name: 'A',
        },
        overrideAccess: true,
      })

      const updated = await payload.update({
        collection: 'users',
        id: user.id,
        data: { name: 'B', status: 'active' },
        user,
        overrideAccess: false,
      })
      expect(updated.name).toBe('B')
      expect(updated.status).toBe('pending')

      const reloaded = await payload.findByID({
        collection: 'users',
        id: user.id,
        overrideAccess: true,
      })
      expect(reloaded.status).toBe('pending')
    })
  })

  describe('self-service account request', () => {
    it('is blocked when no admin site has account applications enabled', async () => {
      await setAccountApplication(false)
      await expect(
        submitAccountRequest(payload, {
          loginId: uniqueLoginId('blocked'),
          email: uniqueEmail('blocked'),
          name: 'Blocked',
          password: STRONG_PW,
          confirmPassword: STRONG_PW,
        }),
      ).rejects.toBeInstanceOf(AccountRequestError)
    })

    it('creates a pending, roleless account AND strips client-supplied status/roles (CRITICAL)', async () => {
      await setAccountApplication(true)
      const adminId = await roleAdminId()

      const result = await submitAccountRequest(payload, {
        loginId: uniqueLoginId('applicant'),
        email: uniqueEmail('applicant'),
        name: 'Hostile Applicant',
        mobile: '010-1234-5678',
        password: STRONG_PW,
        confirmPassword: STRONG_PW,
        // Hostile: must be ignored.
        status: 'active',
        roles: [adminId],
      })

      const created = await payload.findByID({
        collection: 'users',
        id: result.id,
        overrideAccess: true,
      })
      expect(created.status).toBe('pending')
      expect((created.roles ?? []).map(toRelationId)).not.toContain(adminId)
      expect(created.roles ?? []).toHaveLength(0)
    })

    it('rejects a duplicate email', async () => {
      await setAccountApplication(true)
      const email = uniqueEmail('dupe')
      await submitAccountRequest(payload, {
        loginId: uniqueLoginId('dupea'),
        email,
        name: 'First',
        password: STRONG_PW,
        confirmPassword: STRONG_PW,
      })
      await expect(
        submitAccountRequest(payload, {
          loginId: uniqueLoginId('dupeb'),
          email,
          name: 'Second',
          password: STRONG_PW,
          confirmPassword: STRONG_PW,
        }),
      ).rejects.toThrow(/email already exists/i)
    })

    it('rejects a mismatched confirmation and a policy-violating password', async () => {
      await setAccountApplication(true)
      await expect(
        submitAccountRequest(payload, {
          loginId: uniqueLoginId('mismatch'),
          email: uniqueEmail('mismatch'),
          name: 'X',
          password: STRONG_PW,
          confirmPassword: 'different',
        }),
      ).rejects.toThrow(/do not match/i)

      await expect(
        submitAccountRequest(payload, {
          loginId: uniqueLoginId('weakpw'),
          email: uniqueEmail('weakpw'),
          name: 'X',
          password: 'weak',
          confirmPassword: 'weak',
        }),
      ).rejects.toThrow(/at least|combine/i)
    })
  })

  describe('ID / password recovery (generic responses + Mailpit round-trip)', () => {
    it('find-id emails the login ID of a matching ACTIVE account', async () => {
      const email = uniqueEmail('findid')
      const loginId = uniqueLoginId('findid')
      await payload.create({
        collection: 'users',
        data: { email, loginId, name: 'Ida Finder', password: STRONG_PW, status: 'active' },
        overrideAccess: true,
      })

      const result = await findId(payload, { name: 'Ida Finder', email })
      expect(result.message).toBe(GENERIC_FIND_ID_MESSAGE)
      expect(result.emailed).toBe(true)

      const messages = await pollMailpitTo(email)
      expect(messages.length).toBeGreaterThan(0)
      expect(messages.some((m) => /login id/i.test(m.Subject))).toBe(true)
    })

    it('find-id is generic (no email) for a non-matching name — no enumeration', async () => {
      const email = uniqueEmail('findidmiss')
      await payload.create({
        collection: 'users',
        data: {
          email,
          loginId: uniqueLoginId('miss'),
          name: 'Real Name',
          password: STRONG_PW,
          status: 'active',
        },
        overrideAccess: true,
      })
      const result = await findId(payload, { name: 'Wrong Name', email })
      expect(result.message).toBe(GENERIC_FIND_ID_MESSAGE)
      expect(result.emailed).toBe(false)
    })

    it('find-id does NOT email a pending (unapproved) account', async () => {
      const email = uniqueEmail('findidpending')
      await payload.create({
        collection: 'users',
        data: {
          email,
          loginId: uniqueLoginId('pend'),
          name: 'Pending Person',
          password: STRONG_PW,
          status: 'pending',
        },
        overrideAccess: true,
      })
      const result = await findId(payload, { name: 'Pending Person', email })
      expect(result.emailed).toBe(false)
    })

    it('find-password emails a reset link for a matching ACTIVE account', async () => {
      const email = uniqueEmail('findpw')
      const loginId = uniqueLoginId('findpw')
      await payload.create({
        collection: 'users',
        data: { email, loginId, name: 'Pat Reset', password: STRONG_PW, status: 'active' },
        overrideAccess: true,
      })

      const result = await findPassword(payload, { loginId, email })
      expect(result.message).toBe(GENERIC_FIND_PASSWORD_MESSAGE)
      expect(result.emailed).toBe(true)

      const messages = await pollMailpitTo(email)
      expect(messages.length).toBeGreaterThan(0)
      expect(messages.some((m) => /reset/i.test(m.Subject))).toBe(true)
    })

    it('find-password is generic (no reset) for a pending account', async () => {
      const email = uniqueEmail('findpwpending')
      await payload.create({
        collection: 'users',
        data: { email, loginId: uniqueLoginId('pwpend'), password: STRONG_PW, status: 'pending' },
        overrideAccess: true,
      })
      const result = await findPassword(payload, { email })
      expect(result.message).toBe(GENERIC_FIND_PASSWORD_MESSAGE)
      expect(result.emailed).toBe(false)
    })
  })

  describe('dormancy sweep', () => {
    it('flips a long-inactive active account to dormant, which then cannot log in', async () => {
      const email = uniqueEmail('dormant-sweep')
      const user = await payload.create({
        collection: 'users',
        data: {
          email,
          password: STRONG_PW,
          status: 'active',
          // 200 days ago — well past the 90-day threshold.
          lastLoginAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
        },
        overrideAccess: true,
      })

      // A fresh active account that must NOT be swept.
      const recent = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('recent'),
          password: STRONG_PW,
          status: 'active',
          lastLoginAt: new Date().toISOString(),
        },
        overrideAccess: true,
      })

      const result = await markDormantAccounts(payload, 90)
      expect(result.ids.map(String)).toContain(String(user.id))
      expect(result.ids.map(String)).not.toContain(String(recent.id))

      const reloaded = await payload.findByID({
        collection: 'users',
        id: user.id,
        overrideAccess: true,
      })
      expect(reloaded.status).toBe('dormant')

      // And is now blocked at login.
      await expect(
        payload.login({ collection: 'users', data: { email, password: STRONG_PW } }),
      ).rejects.toThrow(/dormant/i)
    })
  })
})
