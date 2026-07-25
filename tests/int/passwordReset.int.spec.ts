import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'
import { resetPublicRateLimiter } from '@/security/rateLimit'

/**
 * Task 2D Part 1 — password policy on the REAL reset flow (carried I-3), driven
 * end to end through `forgotPassword` → `resetPassword` (the same operation the
 * public find-password recovery path invokes). Part 2 — rate limiting the
 * built-in reset submission.
 */

let payload: Payload

/** Strong password satisfying ref 3-9 (3 classes, 12 chars, no sequence). */
const STRONG_PW = 'Vault7-mkpqz'
/** A DIFFERENT strong password used to prove the reset actually changed the hash. */
const NEW_STRONG_PW = 'Harbor9$wxtm'

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 10000)}`
}
function uniqueEmail(label: string): string {
  return `${unique(label)}@example.com`
}
/**
 * A unique, policy-safe login ID: lowercase LETTERS only (no digits, so
 * embedding it in a password can never introduce a numeric sequence), long
 * enough to be effectively collision-free in the shared dev DB across runs.
 */
function uniqueLoginId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  const rand = Array.from(
    { length: 10 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('')
  return `ruser${rand}`
}

/** Returns the HTTP status of the error a thrown operation raises (or undefined on success). */
async function statusOfRejection(fn: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await fn()
    return undefined
  } catch (err) {
    return (err as { status?: number }).status
  }
}

/** Creates an ACTIVE user and returns its email (+ loginId when supplied). */
async function makeActiveUser(opts: { loginId?: string } = {}): Promise<{ email: string }> {
  const email = uniqueEmail('reset')
  await payload.create({
    collection: 'users',
    data: {
      email,
      ...(opts.loginId ? { loginId: opts.loginId } : {}),
      password: STRONG_PW,
      status: 'active',
    },
    overrideAccess: true,
  })
  return { email }
}

/** Requests a reset token for `email` without sending mail. */
async function issueResetToken(email: string): Promise<string> {
  const token = await payload.forgotPassword({
    collection: 'users',
    data: { email },
    disableEmail: true,
  })
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(`forgotPassword did not return a token for ${email}`)
  }
  return token
}

async function resetWith(token: string, password: string) {
  return payload.resetPassword({
    collection: 'users',
    data: { token, password },
    overrideAccess: true,
  })
}

describe('password reset flow enforcement + rate limiting (Task 2D)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, rolesStep, superAdminStep])
  })

  beforeEach(() => {
    // Deterministic isolation: the reset-rate-limit hook shares a process-wide
    // limiter, so start every case with a clean bucket.
    resetPublicRateLimiter()
  })

  describe('Part 1 — policy is enforced on the real reset-password operation', () => {
    it('REJECTS a single-class weak password through forgotPassword → resetPassword', async () => {
      const { email } = await makeActiveUser()
      const token = await issueResetToken(email)
      await expect(resetWith(token, 'weak')).rejects.toThrow(/combine at least two/i)
    })

    it('REJECTS a sequence password (e.g. contains 1234) on reset', async () => {
      const { email } = await makeActiveUser()
      const token = await issueResetToken(email)
      await expect(resetWith(token, 'mxkpvh1234')).rejects.toThrow(/sequences/i)
    })

    it('REJECTS a password containing the login ID on reset (loginId resolved by token)', async () => {
      const loginId = uniqueLoginId()
      const { email } = await makeActiveUser({ loginId })
      const token = await issueResetToken(email)
      // 3 classes / long / no sequence — ONLY the login-ID rule can reject, which
      // proves the token→user lookup that feeds `validatePassword` works.
      await expect(resetWith(token, `A9!${loginId}Z`)).rejects.toThrow(/login id/i)
    })

    it('ACCEPTS a strong password on reset, and the new password then works at login', async () => {
      const { email } = await makeActiveUser()
      const token = await issueResetToken(email)

      const result = await resetWith(token, NEW_STRONG_PW)
      expect(result.token).toBeTruthy()

      // Prove the hash actually changed: the NEW password authenticates, the OLD
      // one no longer does.
      const login = await payload.login({
        collection: 'users',
        data: { email, password: NEW_STRONG_PW },
      })
      expect(login.token).toBeTruthy()

      await expect(
        payload.login({ collection: 'users', data: { email, password: STRONG_PW } }),
      ).rejects.toThrow()
    })
  })

  describe('Part 1 regression — create/update enforcement is unaffected', () => {
    it('still rejects a weak password on create and a weak password on update', async () => {
      await expect(
        payload.create({
          collection: 'users',
          data: { email: uniqueEmail('reg'), password: 'weak', status: 'active' },
          overrideAccess: true,
        }),
      ).rejects.toThrow(/combine at least two/i)

      const user = await payload.create({
        collection: 'users',
        data: { email: uniqueEmail('reg'), password: STRONG_PW, status: 'active' },
        overrideAccess: true,
      })
      await expect(
        payload.update({
          collection: 'users',
          id: user.id,
          data: { password: 'short1a' },
          overrideAccess: true,
        }),
      ).rejects.toThrow(/at least/i)
    })
  })

  describe('Part 2 — the built-in reset submission is rate limited', () => {
    it('throws 429 once the per-window limit is exceeded, before the token check', async () => {
      const prevMax = process.env.PUBLIC_RATE_LIMIT_MAX
      process.env.PUBLIC_RATE_LIMIT_MAX = '3'
      resetPublicRateLimiter()
      try {
        // Invalid token + STRONG password: the rate-limit hook runs first, then
        // the policy passes, then the operation rejects the token (403). After
        // `max` hits, the rate-limit hook short-circuits with 429 ahead of both.
        const attempt = () => resetWith('invalid-token-value', NEW_STRONG_PW)

        expect(await statusOfRejection(attempt)).toBe(403)
        expect(await statusOfRejection(attempt)).toBe(403)
        expect(await statusOfRejection(attempt)).toBe(403)
        expect(await statusOfRejection(attempt)).toBe(429)
      } finally {
        if (prevMax === undefined) delete process.env.PUBLIC_RATE_LIMIT_MAX
        else process.env.PUBLIC_RATE_LIMIT_MAX = prevMax
        resetPublicRateLimiter()
      }
    })
  })
})
