import type { Access, CollectionConfig, TextFieldSingleValidation } from 'payload'

import { hasMenuAccessSync, menuAccess, menuFieldAccess } from '../access/hasMenuAccess'
import { isMemberPrincipal } from '../access/memberAccess'
import { auditCollection } from '../audit/auditCollection'
import { recordLoginFailure, recordLogout } from '../audit/authHooks'
import { journalUserRoleChanges } from '../audit/permissionJournals'
import {
  blockInactiveLogin,
  enforcePasswordPolicy,
  enforcePasswordPolicyOnReset,
  recordLastLogin,
} from '../auth/userHooks'
import { rateLimitPasswordRecovery } from '../security/rateLimit'
import {
  auditForcedLogout,
  notifyTwoFactorReset,
  processTwoFactorAdminReset,
  require2FA,
  revokeSessionsOnStatusChange,
  throttleTwoFactorFailure,
} from '../auth/twoFactorHooks'
import { renderForgotPasswordEmail } from '../email/authEmails'

/**
 * Access-history audit hooks (Task 2A) for this collection's mutations.
 * `linkActor: false` because a `users` mutation locks the mutated user row,
 * which would deadlock the isolated audit write's `actor` FK when a user edits
 * their own account (identity is still captured via `actorLabel`) — see
 * `RecordAccessArgs.linkActor`.
 */
const usersAudit = auditCollection('system.admins', { linkActor: false })

/**
 * `read`/`update` access for `users`: any authenticated user may always
 * read+update THEIR OWN doc (self-access override, per the Task 1C brief),
 * regardless of role grants; anyone holding `system.admins` may read/update
 * everyone. No user → false.
 *
 * For a `findByID`-style check (`id` provided): an exact self-match returns
 * `true` immediately; otherwise falls through to the menu grant.
 * For a list-style check (`id` undefined, e.g. the admin list view): a full
 * grant returns `true` (see everyone); otherwise returns a `Where` that
 * restricts the list to the caller's own doc — Payload supports `Access`
 * returning either a `boolean` or a `Where` (see `AccessResult` in
 * `node_modules/payload/dist/config/types.d.ts`), and evaluates a returned
 * `Where` against a specific doc too, so this same branch also correctly
 * denies a non-self, non-granted `findByID` on someone else's doc.
 *
 * SECURITY: this only gates whether an update to the *document* is allowed
 * at all — it does not, by itself, restrict which *fields* a self-editing
 * user may change. Without a separate field-level gate, the self-access
 * override here would let any authenticated user PATCH their own `roles`
 * to include `ROLE_ADMIN` (`isSuper`) and grant themselves full access —
 * see the `access` on the `roles` field below, which is what actually
 * closes that hole. Found and fixed post-implementation via security
 * review; see the "Fix — security review" section of task-1C-report.md.
 */
function selfOrMenuAccess(menuKey: string): Access {
  const menuGate = menuAccess(menuKey)
  return async (args) => {
    const { id, req } = args
    // No user, OR a PUBLIC-SITE MEMBER (a different audience that shares the
    // token-cookie space) → deny. Without the member check, the self-access
    // `Where` below (`{ id: { equals: req.user.id } }`) would match the admin
    // `users` row whose numeric id collides with the member's — a cross-audience
    // leak. A member must have NIL access to `users`.
    if (!req.user || isMemberPrincipal(req.user)) {
      return false
    }
    if (id !== undefined && id === req.user.id) {
      return true
    }
    if (await menuGate(args)) {
      return true
    }
    return { id: { equals: req.user.id } }
  }
}

/**
 * A custom `validate` REPLACES Payload's default required-checking validator
 * (see `validateSiteId` in src/collections/Sites.ts) — since `loginId` is
 * optional at the collection level (self-service applicants supply it via the
 * account-request endpoint; the seeded super-admin and Local-API-created test
 * users may not have one), this only enforces a format on non-empty values.
 */
const validateLoginId: TextFieldSingleValidation = (value) => {
  if (typeof value === 'string' && value.length > 0 && !/^[a-z0-9][a-z0-9._-]{3,}$/.test(value)) {
    return 'Login ID must be at least 4 characters: lowercase letters, digits, and . _ - only, starting with a letter or digit.'
  }
  return true
}

/**
 * Legacy 관리자 계정 관리 (Admin Account Management) — refs 1-15/1-16. Task 1D
 * completes the admin-account lifecycle on top of Task 1C's `roles`/`name`:
 * approval `status`, profile fields (`department`, `duties`, `mobile`,
 * `extension`, `profilePhoto`), a legacy login `loginId`, and login gating.
 *
 * ## Two independent "locked" concepts (kept separate on purpose)
 *
 *  - Payload-native lock (`maxLoginAttempts`/`lockTime` → `loginAttempts`/
 *    `lockUntil`): a *transient* brute-force lock that Payload sets and clears
 *    itself after `lockTime`. We enable it (5 attempts / 10 min).
 *  - `status` (this collection's business lifecycle): `pending` → `active`
 *    (approval), `active` → `dormant` (long inactivity), plus a manual
 *    `locked`. This is admin-managed and does NOT auto-clear.
 *
 * They are deliberately NOT wired together (the brief calls this out): an
 * auto-lock from failed attempts must not stomp the `dormant`/`pending`
 * lifecycle, and reactivation from `dormant` is an admin action, not a
 * time-based unlock. `blockInactiveLogin` (beforeLogin) enforces the `status`
 * gate; the native lock is enforced by Payload before that hook runs.
 *
 * `auth.depth: 1` is load-bearing, not cosmetic — see the design-decision
 * comment at the top of `src/access/hasMenuAccess.ts` for why the
 * synchronous `admin.hidden` nav-visibility check depends on `req.user.roles`
 * always arriving as populated `Role` docs on real HTTP admin requests.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'loginId', 'name', 'status'],
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    // Deliberately does NOT special-case self here: hiding the collection
    // from the nav for a roleless self-service user is a presentational
    // gap only (they can still self-read/update via direct API/URL per the
    // access config below) — a dedicated "my profile" surface for such
    // users is a later task.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'system.admins'),
  },
  access: {
    create: menuAccess('system.admins'),
    read: selfOrMenuAccess('system.admins'),
    update: selfOrMenuAccess('system.admins'),
    delete: menuAccess('system.admins'),
  },
  auth: {
    depth: 1,
    // Native transient brute-force lock (ref 1-1 "계정이 잠긴 상태"). Distinct
    // from the `status` lifecycle — see the collection doc comment above.
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000, // 10 minutes
    // Password recovery email (ref 1-3 Find PW) uses the branded template.
    forgotPassword: {
      generateEmailSubject: () => 'Reset your Pulse CMS password',
      generateEmailHTML: (args) => renderForgotPasswordEmail(args ?? {}),
    },
  },
  hooks: {
    // Task 2D — operation-level guards for the built-in password-recovery flows.
    // `rateLimitPasswordRecovery` rate-limits BOTH `forgotPassword`
    // (`POST /api/users/forgot-password` + GraphQL, which are IP-guard-exempt
    // and bypass our custom /api/find-password endpoint) and `resetPassword`
    // (`POST /api/users/reset-password`). Then `enforcePasswordPolicyOnReset`
    // applies the ref-3-9 composition policy to the still-plaintext reset
    // password (carried I-3). Both no-op for every unrelated operation. See
    // their doc comments for why reset needs `beforeOperation`, not
    // `beforeValidate`.
    beforeOperation: [rateLimitPasswordRecovery, enforcePasswordPolicyOnReset],
    // Password composition policy (ref 3-9) — runs while `data.password` is
    // still plaintext, on both create and update. See `enforcePasswordPolicy`.
    beforeValidate: [enforcePasswordPolicy],
    // Task 2B: process admin 2FA-reset actions (Part 4) and revoke live
    // sessions when `status` flips to non-active (carried I-2, Part 5). Both
    // mutate `data` in place — field write-access was already enforced in the
    // earlier beforeValidate field phase, so these access-locked writes persist.
    beforeChange: [processTwoFactorAdminReset, revokeSessionsOnStatusChange],
    // Only `status: active` accounts may authenticate (ref 1-16), then the
    // Google-OTP 2FA gate (Task 2B Part 3) — runs after the status gate so it
    // only sees an already password-verified, active user.
    beforeLogin: [blockInactiveLogin, require2FA],
    // Stamp `lastLoginAt` (dormancy sweep) + write the `login` accessLog and a
    // success `loginHistory` row (Task 2A, refs 1-55/3-7). See `recordLastLogin`.
    afterLogin: [recordLastLogin],
    // Task 2A: journal any `roles` change (ref 3-2 권한 변경 이력), then record
    // the mutation itself in the access history (ref 1-55/3-1). The login-time
    // `lastLoginAt` stamp is suppressed via `context.skipAudit` to avoid
    // double-logging alongside the dedicated `login` event. Task 2B appends the
    // 2FA-reset notifier (email + audit) and the forced-logout auditor (I-2).
    afterChange: [
      journalUserRoleChanges,
      usersAudit.afterChange,
      notifyTwoFactorReset,
      auditForcedLogout,
    ],
    afterDelete: [usersAudit.afterDelete],
    // Failed-login capture (ref 3-6 로그인 실패 이력) — the only Payload 3.86 seam
    // that fires on a rejected password (see `recordLoginFailure`). Task 2B
    // appends the OTP brute-force throttle, which counts wrong codes here (post
    // transaction-kill, so its user-row write can't deadlock).
    afterError: [recordLoginFailure, throttleTwoFactorFailure],
    // Logout capture (ref 1-55).
    afterLogout: [recordLogout],
  },
  fields: [
    // Email added by default
    {
      name: 'loginId',
      type: 'text',
      unique: true,
      validate: validateLoginId,
      admin: {
        description:
          'Legacy login ID (ref 1-15/1-16 "ID"). Distinct from the email used for authentication; shown in the account list and used by ID/PW recovery. Optional here — self-service applicants supply it via the account-request form.',
      },
    },
    {
      name: 'name',
      type: 'text',
      admin: {
        description: 'Display name (legacy 관리자 이름).',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending approval (승인대기)', value: 'pending' },
        { label: 'Active (정상)', value: 'active' },
        { label: 'Dormant — long inactivity (장기 미로그인)', value: 'dormant' },
        { label: 'Locked', value: 'locked' },
      ],
      // SECURITY (mirrors `roles` below): `status` is privilege-sensitive — a
      // user must NOT be able to self-approve. The collection-level
      // `selfOrMenuAccess` lets a user update their own doc (name, etc.), but
      // this field-level gate requires `system.admins` to create/change
      // `status`, even on your own account. `overrideAccess` (seed,
      // account-request server create) bypasses this as usual.
      access: {
        create: menuFieldAccess('system.admins'),
        update: menuFieldAccess('system.admins'),
      },
      admin: {
        description:
          'Account lifecycle. Only "Active" accounts may log in. Approve a pending account by switching to Active; a dormant account is reactivated the same way.',
      },
    },
    {
      name: 'roles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
      saveToJWT: true,
      // Field-level access — see `menuFieldAccess`'s doc comment in
      // src/access/hasMenuAccess.ts for why this is required in addition
      // to (not covered by) the collection-level `selfOrMenuAccess` above:
      // a user may always update the rest of their own doc (name/email/
      // password), but changing *who holds which roles* — including their
      // own — always requires `system.admins`, with `isSuper` honored
      // inside `hasMenuAccess` as usual. This is what actually prevents a
      // roleless user from self-assigning `ROLE_ADMIN`.
      access: {
        create: menuFieldAccess('system.admins'),
        update: menuFieldAccess('system.admins'),
      },
      admin: {
        description:
          "Roles held by this admin. Effective menu access is the union of every held role's grants, or unconditional if any held role has isSuper checked. Changing this field always requires the system.admins grant, even when editing your own account.",
      },
    },
    // Profile fields (ref 1-16). All optional; `department` and `profilePhoto`
    // are relationships (department tree / media upload).
    {
      name: 'department',
      type: 'relationship',
      relationTo: 'departments',
      admin: {
        description: 'Department this admin belongs to (legacy 부서, picked from the tree).',
      },
    },
    {
      name: 'duties',
      type: 'textarea',
      admin: {
        description: 'Duties/role description (legacy 업무내용) — shown in the org chart later.',
      },
    },
    {
      name: 'mobile',
      type: 'text',
      admin: {
        description: 'Mobile phone number (legacy 휴대전화).',
      },
    },
    {
      name: 'extension',
      type: 'text',
      admin: {
        description: 'Internal extension (legacy 내선번호).',
      },
    },
    {
      name: 'profilePhoto',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Profile photo (legacy 프로필 사진; jpg/jpeg/png/gif, displayed 64×64).',
      },
    },
    {
      name: 'lastLoginAt',
      type: 'date',
      // System-maintained (stamped by `recordLastLogin` on login via
      // overrideAccess). Not client-writable; read-only in the admin UI. The
      // dormancy sweep (`markDormantAccounts`) reads it.
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description: 'Last successful login. Maintained by the system; used by the dormancy sweep.',
      },
    },
    // ── Google-OTP two-factor authentication (Task 2B; refs 1-4/1-5/1-6) ──
    {
      name: 'totpSecret',
      type: 'text',
      // SECURITY: the shared TOTP secret must NEVER reach any client. Two
      // independent guards: `hidden` strips it from every read unless
      // `showHiddenFields` is explicitly set, and `access.read: () => false`
      // strips it for every non-`overrideAccess` caller regardless. Only the
      // enrolment/login/reset server code reads it (overrideAccess +
      // showHiddenFields) and writes it (overrideAccess or a server hook). It is
      // verified absent from `/api/users/me` and the list view by the tests.
      hidden: true,
      access: {
        read: () => false,
        create: () => false,
        update: () => false,
      },
    },
    {
      name: 'totpConfirmed',
      type: 'checkbox',
      defaultValue: false,
      // System-managed: set true only by `verify-enroll`, cleared by an admin
      // reset — never client-writable (overrideAccess/server hooks bypass this).
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description:
          'Whether Google-OTP two-factor authentication is set up and confirmed for this account.',
      },
    },
    {
      name: 'totpEnrolledAt',
      type: 'date',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description: 'When two-factor authentication was confirmed. Null until first enrolment.',
      },
    },
    // OTP brute-force throttle state (Task 2B fix). System-managed: incremented
    // by `throttleTwoFactorFailure` (afterError) on a wrong code, reset by
    // `require2FA` on a correct one. Admin-readable for support, never
    // client-writable.
    {
      name: 'totpFailedAttempts',
      type: 'number',
      defaultValue: 0,
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description: 'Consecutive failed OTP codes. Resets on a successful code.',
      },
    },
    {
      name: 'totpLockUntil',
      type: 'date',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description:
          'When set to a future time, the OTP step is locked out (too many failed codes). Auto-clears on expiry / a successful code.',
      },
    },
    // Admin-only reset ACTIONS (ref 1-16). One-shot checkboxes gated on
    // `system.admins`: checking one and saving performs the action (see
    // `processTwoFactorAdminReset`) and the box resets itself to unchecked.
    {
      name: 'resetTwoFactorDevice',
      type: 'checkbox',
      defaultValue: false,
      access: {
        create: menuFieldAccess('system.admins'),
        update: menuFieldAccess('system.admins'),
      },
      admin: {
        description:
          'Admin action: clear this user’s 2FA enrolment so they must set up a new device on next login. The user is emailed. Requires the system.admins grant.',
      },
    },
    {
      name: 'regenerateTwoFactorSecret',
      type: 'checkbox',
      defaultValue: false,
      access: {
        create: menuFieldAccess('system.admins'),
        update: menuFieldAccess('system.admins'),
      },
      admin: {
        description:
          'Admin action: regenerate this user’s OTP secret (invalidates the old code immediately; user re-enrols with a new QR). The user is emailed. Requires the system.admins grant.',
      },
    },
  ],
}
