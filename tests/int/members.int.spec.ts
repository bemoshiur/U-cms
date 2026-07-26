import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep, ROLE_ADMIN_ROLE_ID } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'
import { sitesStep } from '@/seed/steps/sites'
import { memberBannedWordsStep } from '@/seed/steps/memberBannedWords'
import { submitMemberSignup } from '@/members/signup'
import { readMemberFromHeaders } from '@/site/member'

/**
 * Public-site MEMBER auth (Task 4B). Boots real Payload against Postgres and
 * exercises: sign-up security (forced tenant/status, stripped client fields,
 * banned words, dup, password policy, terms consent + snapshot), the login
 * status gate, member↔admin audience separation (a member session grants NIL
 * admin access), the getCurrentMember session wiring, and profile-edit field
 * restrictions.
 */

let payload: Payload

/** Member password: 8+ chars, ≥2 classes, no login-ID substring. */
const MEMBER_PW = 'Member-Pass-99'
const ADMIN_PW = 'Vault7-mkpqz'

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 10000)}`
}
function uniqueEmail(label: string): string {
  return `${unique(label)}@example.com`
}
function uniqueLoginId(label: string): string {
  return unique(label).toLowerCase()
}

/** Logs a principal in and returns the authenticated user (with `collection`). */
async function authenticate(
  collection: 'members' | 'users',
  email: string,
  password: string,
): Promise<{ token: string; headers: Headers; user: unknown }> {
  const { token } = await payload.login({ collection, data: { email, password } })
  // `Sec-Fetch-Site: same-origin` satisfies Payload's cookie-token CSRF check
  // when no `Origin` header is present (real browser navigations always send
  // one of Origin / Sec-Fetch-Site — see extractJWT's cookie extractor).
  const headers = new Headers({
    cookie: `payload-token=${token}`,
    'Sec-Fetch-Site': 'same-origin',
  })
  const { user } = await payload.auth({ headers })
  return { token: token as string, headers, user }
}

describe('public-site members auth (Task 4B)', () => {
  let siteId: number
  let siteSlug: string

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [
      adminMenusStep,
      rolesStep,
      superAdminStep,
      sitesStep,
      memberBannedWordsStep,
    ])

    // A dedicated USER-FACING site to sign members up on.
    siteSlug = uniqueLoginId('msite')
    const site = await payload.create({
      collection: 'sites',
      data: { siteId: siteSlug, name: 'Member Test Site', url: 'https://members.example.com' },
      overrideAccess: true,
    })
    siteId = site.id
  })

  describe('sign-up security', () => {
    it('forces tenant + status=active and STRIPS client-supplied tenant/status/roles (CRITICAL)', async () => {
      const roleAdmin = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: ROLE_ADMIN_ROLE_ID } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const adminRoleId = roleAdmin.docs[0]!.id

      const result = await submitMemberSignup(
        payload,
        {
          loginId: uniqueLoginId('hostile'),
          email: uniqueEmail('hostile'),
          name: 'Hostile Signer',
          password: MEMBER_PW,
          confirmPassword: MEMBER_PW,
          agreeService: true,
          agreePrivacy: true,
          // Hostile: must all be ignored.
          status: 'active',
          tenant: 999999,
          roles: [adminRoleId],
        },
        { siteId: siteSlug },
      )

      const created = await payload.findByID({
        collection: 'members',
        id: result.id,
        overrideAccess: true,
      })
      expect(created.status).toBe('active')
      expect(toRelationId(created.tenant)).toBe(siteId)
      // Members have no roles field at all — no privilege could attach.
      expect((created as unknown as Record<string, unknown>).roles).toBeUndefined()
    })

    it('rejects a banned login ID (seeded "admin" loginId scope)', async () => {
      await expect(
        submitMemberSignup(
          payload,
          {
            loginId: 'adminperson',
            email: uniqueEmail('banned'),
            name: 'Banned',
            password: MEMBER_PW,
            confirmPassword: MEMBER_PW,
            agreeService: true,
            agreePrivacy: true,
          },
          { siteId: siteSlug },
        ),
      ).rejects.toThrow(/not allowed/i)
    })

    it('rejects a duplicate login ID within the site, and a duplicate email', async () => {
      const loginId = uniqueLoginId('dup')
      const email = uniqueEmail('dup')
      await submitMemberSignup(
        payload,
        {
          loginId,
          email,
          name: 'First',
          password: MEMBER_PW,
          confirmPassword: MEMBER_PW,
          agreeService: true,
          agreePrivacy: true,
        },
        { siteId: siteSlug },
      )
      await expect(
        submitMemberSignup(
          payload,
          {
            loginId,
            email: uniqueEmail('dup2'),
            name: 'Second',
            password: MEMBER_PW,
            confirmPassword: MEMBER_PW,
            agreeService: true,
            agreePrivacy: true,
          },
          { siteId: siteSlug },
        ),
      ).rejects.toThrow(/already in use on this site/i)
      await expect(
        submitMemberSignup(
          payload,
          {
            loginId: uniqueLoginId('dup3'),
            email,
            name: 'Third',
            password: MEMBER_PW,
            confirmPassword: MEMBER_PW,
            agreeService: true,
            agreePrivacy: true,
          },
          { siteId: siteSlug },
        ),
      ).rejects.toThrow(/email already exists/i)
    })

    it('enforces the member password policy and confirmation match', async () => {
      await expect(
        submitMemberSignup(
          payload,
          {
            loginId: uniqueLoginId('weak'),
            email: uniqueEmail('weak'),
            name: 'Weak',
            password: 'short',
            confirmPassword: 'short',
            agreeService: true,
            agreePrivacy: true,
          },
          { siteId: siteSlug },
        ),
      ).rejects.toThrow(/at least 8/i)
      await expect(
        submitMemberSignup(
          payload,
          {
            loginId: uniqueLoginId('mismatch'),
            email: uniqueEmail('mismatch'),
            name: 'Mismatch',
            password: MEMBER_PW,
            confirmPassword: 'different1',
            agreeService: true,
            agreePrivacy: true,
          },
          { siteId: siteSlug },
        ),
      ).rejects.toThrow(/do not match/i)
    })

    it('requires terms consent and STORES the consent snapshot', async () => {
      await expect(
        submitMemberSignup(
          payload,
          {
            loginId: uniqueLoginId('noterms'),
            email: uniqueEmail('noterms'),
            name: 'No Terms',
            password: MEMBER_PW,
            confirmPassword: MEMBER_PW,
            agreeService: true,
            agreePrivacy: false, // missing required agreement
          },
          { siteId: siteSlug },
        ),
      ).rejects.toThrow(/agree to the required terms/i)

      const okResult = await submitMemberSignup(
        payload,
        {
          loginId: uniqueLoginId('terms'),
          email: uniqueEmail('terms'),
          name: 'With Terms',
          password: MEMBER_PW,
          confirmPassword: MEMBER_PW,
          agreeService: true,
          agreePrivacy: true,
        },
        { siteId: siteSlug },
      )
      const created = await payload.findByID({
        collection: 'members',
        id: okResult.id,
        overrideAccess: true,
      })
      const categories = (created.termsConsents ?? []).map((c) => c.category).sort()
      expect(categories).toEqual(['privacy', 'service'])
      expect((created.termsConsents ?? [])[0]?.version).toBeTruthy()
      expect((created.termsConsents ?? [])[0]?.agreedAt).toBeTruthy()
    })

    it('is blocked on an admin site', async () => {
      const adminSite = await payload.find({
        collection: 'sites',
        where: { isAdminSite: { equals: true } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      await expect(
        submitMemberSignup(
          payload,
          {
            loginId: uniqueLoginId('onadmin'),
            email: uniqueEmail('onadmin'),
            name: 'On Admin',
            password: MEMBER_PW,
            confirmPassword: MEMBER_PW,
            agreeService: true,
            agreePrivacy: true,
          },
          { siteId: String(adminSite.docs[0]!.siteId) },
        ),
      ).rejects.toThrow(/not available/i)
    })
  })

  describe('login status gate', () => {
    async function makeMember(status: 'active' | 'pending' | 'dormant' | 'withdrawn') {
      const email = uniqueEmail(`login-${status}`)
      await payload.create({
        collection: 'members',
        data: {
          loginId: uniqueLoginId(`login${status}`),
          email,
          name: `Login ${status}`,
          password: MEMBER_PW,
          status,
          tenant: siteId,
        },
        overrideAccess: true,
      })
      return email
    }

    it('allows an active member to log in', async () => {
      const email = await makeMember('active')
      const result = await payload.login({
        collection: 'members',
        data: { email, password: MEMBER_PW },
      })
      expect(result.token).toBeTruthy()
    })

    it('blocks pending / dormant / withdrawn members', async () => {
      for (const [status, re] of [
        ['pending', /awaiting approval/i],
        ['dormant', /dormant/i],
        ['withdrawn', /withdrawn/i],
      ] as const) {
        const email = await makeMember(status)
        await expect(
          payload.login({ collection: 'members', data: { email, password: MEMBER_PW } }),
        ).rejects.toThrow(re)
      }
    })
  })

  describe('member ↔ admin audience separation (NIL admin access)', () => {
    let memberEmail: string
    let memberHeaders: Headers
    let memberUser: unknown

    beforeAll(async () => {
      memberEmail = uniqueEmail('sep')
      await payload.create({
        collection: 'members',
        data: {
          loginId: uniqueLoginId('sep'),
          email: memberEmail,
          name: 'Separation Member',
          password: MEMBER_PW,
          status: 'active',
          tenant: siteId,
        },
        overrideAccess: true,
      })
      const auth = await authenticate('members', memberEmail, MEMBER_PW)
      memberHeaders = auth.headers
      memberUser = auth.user
    })

    it('getCurrentMember resolves a member session, and an ADMIN session resolves to null', async () => {
      const asMember = await readMemberFromHeaders(payload, memberHeaders)
      expect(asMember?.id).toBeDefined()
      expect(asMember?.name).toBe('Separation Member')

      // A super-admin session must NOT be seen as a public-site member.
      const adminEmail = uniqueEmail('adminsep')
      await payload.create({
        collection: 'users',
        data: { email: adminEmail, password: ADMIN_PW, status: 'active' },
        overrideAccess: true,
      })
      const adminAuth = await authenticate('users', adminEmail, ADMIN_PW)
      expect(await readMemberFromHeaders(payload, adminAuth.headers)).toBeNull()
    })

    it('a member session cannot read the admin users, sites, or posts collections', async () => {
      await expect(
        payload.find({ collection: 'users', overrideAccess: false, user: memberUser as never }),
      ).rejects.toThrow()
      await expect(
        payload.find({ collection: 'sites', overrideAccess: false, user: memberUser as never }),
      ).rejects.toThrow()
      await expect(
        payload.find({ collection: 'posts', overrideAccess: false, user: memberUser as never }),
      ).rejects.toThrow()
    })

    it('a member cannot read ANOTHER member', async () => {
      const otherEmail = uniqueEmail('other')
      const other = await payload.create({
        collection: 'members',
        data: {
          loginId: uniqueLoginId('other'),
          email: otherEmail,
          name: 'Other Member',
          password: MEMBER_PW,
          status: 'active',
          tenant: siteId,
        },
        overrideAccess: true,
      })
      await expect(
        payload.findByID({
          collection: 'members',
          id: other.id,
          overrideAccess: false,
          user: memberUser as never,
        }),
      ).rejects.toThrow()
    })
  })

  describe('profile edit restrictions (self-escalation defence)', () => {
    it('a member may change name/mobile/marketingConsent but NOT status/tenant/loginId/termsConsents', async () => {
      const email = uniqueEmail('profile')
      const created = await payload.create({
        collection: 'members',
        data: {
          loginId: uniqueLoginId('profile'),
          email,
          name: 'Before',
          password: MEMBER_PW,
          status: 'active',
          tenant: siteId,
          termsConsents: [
            { category: 'service', version: 'orig', agreedAt: new Date().toISOString() },
          ],
        },
        overrideAccess: true,
      })
      const originalLoginId = created.loginId
      const { user } = await authenticate('members', email, MEMBER_PW)

      // Allowed edits + hostile privilege edits in the SAME request.
      const updated = await payload.update({
        collection: 'members',
        id: created.id,
        data: {
          name: 'After',
          mobile: '010-9999-0000',
          marketingConsent: true,
          // Hostile — must all be stripped:
          status: 'pending',
          tenant: 999999,
          loginId: 'hacked-id',
          termsConsents: [
            { category: 'privacy', version: 'forged', agreedAt: new Date().toISOString() },
          ],
        } as never,
        user: user as never,
        overrideAccess: false,
      })

      expect(updated.name).toBe('After')
      expect(updated.mobile).toBe('010-9999-0000')
      expect(updated.marketingConsent).toBe(true)
      // Privilege fields untouched:
      expect(updated.status).toBe('active')
      expect(toRelationId(updated.tenant)).toBe(siteId)
      expect(updated.loginId).toBe(originalLoginId)
      expect((updated.termsConsents ?? [])[0]?.version).toBe('orig')
    })
  })

  describe('per-site approval policy', () => {
    it('creates a PENDING member when the site requires approval', async () => {
      const approvalSlug = uniqueLoginId('approve')
      await payload.create({
        collection: 'sites',
        data: {
          siteId: approvalSlug,
          name: 'Approval Site',
          url: 'https://approve.example.com',
          memberApprovalRequired: true,
        },
        overrideAccess: true,
      })
      const result = await submitMemberSignup(
        payload,
        {
          loginId: uniqueLoginId('approveme'),
          email: uniqueEmail('approveme'),
          name: 'Approve Me',
          password: MEMBER_PW,
          confirmPassword: MEMBER_PW,
          agreeService: true,
          agreePrivacy: true,
        },
        { siteId: approvalSlug },
      )
      expect(result.status).toBe('pending')
    })
  })
})
