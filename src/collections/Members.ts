import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { hasMenuAccessSync, menuFieldAccess } from '../access/hasMenuAccess'
import {
  MEMBERS_MENU_KEY,
  memberManageAccess,
  memberSelfOrManageAccess,
} from '../access/memberAccess'
import { blockInactiveMemberLogin, enforceMemberPasswordPolicy } from '../auth/memberHooks'
import { tenantMembershipGuard } from '../access/tenantAccess'
import { branding } from '../branding'
import { renderMemberForgotPasswordEmail } from '../email/memberEmails'
import { REQUIRED_TERMS_CATEGORIES } from '../members/terms'

/**
 * Public-site MEMBER accounts (Task 4B; refs 2-13 회원 관리 / 회원가입). A SEPARATE
 * auth collection from the admin `users` — a different, lower-privilege audience:
 *
 *  - Members authenticate on the PUBLIC site, not `/admin`. A member session
 *    grants ZERO admin access: every admin collection is gated on `hasMenuAccess`
 *    (which reads `roles` — members have none) and `admin.user` is `users`, so
 *    Payload's panel refuses a member entirely. Verified by tests.
 *  - Members are TENANT-SCOPED (belong to one site). Unlike `boards`/`posts`,
 *    members are NOT opted into the multi-tenant plugin — a second auth
 *    collection through the plugin is avoidable complexity. Instead `tenant` is
 *    a MANUAL required relationship, scoped by the same `tenantScopedMenuAccess`
 *    pattern (`memberSelfOrManageAccess`) + a create-time membership guard.
 *
 * ## Self-escalation defence (Phase-1 users.roles/status class)
 *
 * Collection `read`/`update` lets a member act on their OWN doc, but the
 * privilege-sensitive fields — `status`, `tenant`, `loginId`, `termsConsents` —
 * carry FIELD-level access gated on `members.manage`, so a self-editing member
 * can change name/mobile/password/marketingConsent but can NEVER self-approve
 * (`status`), move sites (`tenant`), change their handle (`loginId`), or rewrite
 * their consent evidence. Server-side sign-up sets those with `overrideAccess`.
 *
 * ## Sessions (documented, deliberate)
 *
 * `useSessions: false` — member tokens are stateless JWTs. Members don't need
 * server-side session revocation this phase (that admin-only machinery — 2FA,
 * status-flip revocation — stays on `users`); logout clears the cookie. A
 * revocable member session store is a later refinement.
 */

/** Member login-ID format (mirrors `users.loginId`): lowercase alnum + . _ - , 4+ chars. */
const validateMemberLoginId: TextFieldSingleValidation = (value) => {
  if (typeof value === 'string' && value.length > 0 && !/^[a-z0-9][a-z0-9._-]{3,}$/.test(value)) {
    return 'Login ID must be at least 4 characters: lowercase letters, digits, and . _ - only, starting with a letter or digit.'
  }
  return true
}

export const Members: CollectionConfig = {
  slug: 'members',
  admin: {
    group: 'Members',
    useAsTitle: 'email',
    defaultColumns: ['email', 'loginId', 'name', 'status', 'tenant'],
    hidden: ({ user }) => !hasMenuAccessSync(user, MEMBERS_MENU_KEY),
  },
  access: {
    create: memberManageAccess(),
    read: memberSelfOrManageAccess(),
    update: memberSelfOrManageAccess(),
    delete: memberManageAccess(),
  },
  auth: {
    // Stateless member tokens — see the collection doc comment.
    useSessions: false,
    depth: 0,
    // Native transient brute-force lock (parity with admin `users`); distinct
    // from the `status` lifecycle gate in `blockInactiveMemberLogin`.
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000, // 10 minutes
    forgotPassword: {
      generateEmailSubject: () => `Reset your ${branding.productName} member password`,
      generateEmailHTML: (args) => renderMemberForgotPasswordEmail(args ?? {}),
    },
  },
  // loginId is unique PER SITE (a handle belongs to one site); email uses
  // Payload's default GLOBAL auth-email uniqueness, which is STRICTER than
  // "unique within the site" and so satisfies it. See task-4B-report.md.
  indexes: [{ fields: ['tenant', 'loginId'], unique: true }],
  fields: [
    // Email added by the auth config.
    {
      name: 'loginId',
      type: 'text',
      required: true,
      validate: validateMemberLoginId,
      // Privilege/identity field — a member cannot change their own handle;
      // set once at sign-up (overrideAccess) and thereafter admin-only.
      access: {
        create: menuFieldAccess(MEMBERS_MENU_KEY),
        update: menuFieldAccess(MEMBERS_MENU_KEY),
      },
      admin: { description: 'Public-site login ID (unique per site).' },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'Display name / nickname. Member-editable.' },
    },
    {
      name: 'mobile',
      type: 'text',
      admin: { description: 'Mobile phone number (optional). Member-editable.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active (정상)', value: 'active' },
        { label: 'Pending approval (승인대기)', value: 'pending' },
        { label: 'Dormant — long inactivity (장기 미로그인)', value: 'dormant' },
        { label: 'Withdrawn (탈퇴)', value: 'withdrawn' },
      ],
      // SECURITY (mirrors users.status): a member must NOT self-approve or
      // reactivate. Admin-only (members.manage); overrideAccess (sign-up) bypasses.
      access: {
        create: menuFieldAccess(MEMBERS_MENU_KEY),
        update: menuFieldAccess(MEMBERS_MENU_KEY),
      },
      admin: {
        description: 'Membership lifecycle. Only "Active" members may log in.',
      },
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      // SECURITY: a member's site is server-forced at sign-up and never
      // client-settable — the tenant boundary the whole scoping model rests on.
      access: {
        create: menuFieldAccess(MEMBERS_MENU_KEY),
        update: menuFieldAccess(MEMBERS_MENU_KEY),
      },
      admin: { description: 'The site (tenant) this member belongs to.' },
    },
    {
      name: 'marketingConsent',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Optional opt-in to marketing messages. Member-editable.',
      },
    },
    {
      // Immutable-ish consent evidence (Part 3). Field-access-locked so a member
      // can never rewrite their own consent history; the sign-up flow writes it
      // once with overrideAccess. See src/members/terms.ts for the T4E seam.
      name: 'termsConsents',
      type: 'array',
      access: {
        create: menuFieldAccess(MEMBERS_MENU_KEY),
        update: menuFieldAccess(MEMBERS_MENU_KEY),
      },
      admin: {
        readOnly: true,
        description:
          'Snapshot of the terms this member accepted at sign-up (category + version + timestamp). Retained as consent evidence; not member-editable.',
      },
      fields: [
        {
          name: 'category',
          type: 'select',
          required: true,
          options: REQUIRED_TERMS_CATEGORIES.map((value) => ({ label: value, value })),
        },
        { name: 'version', type: 'text', required: true },
        { name: 'agreedAt', type: 'date', required: true },
      ],
    },
  ],
  hooks: {
    // Create-time tenant guard (admin creates) + member password policy on any
    // password set. Sign-up runs with overrideAccess, so the guard is a no-op
    // there (no req.user) and the forced server tenant stands.
    beforeValidate: [tenantMembershipGuard('tenant'), enforceMemberPasswordPolicy],
    // Only `active` members may authenticate.
    beforeLogin: [blockInactiveMemberLogin],
  },
}
