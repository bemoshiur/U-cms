import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import type { Plugin } from 'payload'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Sites } from './collections/Sites'
import { Departments } from './collections/Departments'
import { CodeClassifications } from './collections/codes/CodeClassifications'
import { CodeGroups } from './collections/codes/CodeGroups'
import { Codes } from './collections/codes/Codes'
import { BoardTypes } from './collections/boards/BoardTypes'
import { Boards } from './collections/boards/Boards'
import { Roles } from './collections/Roles'
import { AdminMenus } from './collections/AdminMenus'
import { PasswordPolicies } from './collections/PasswordPolicies'
import { AdminIpRules } from './collections/AdminIpRules'
import { AccessLogs } from './collections/AccessLogs'
import { LoginHistory } from './collections/LoginHistory'
import { PermissionChangeLogs } from './collections/PermissionChangeLogs'
import { MenuPermissionLogs } from './collections/MenuPermissionLogs'
import { menuFieldAccess, warmAdminMenuKeyCache } from './access/hasMenuAccess'
import { publicAccountEndpoints } from './endpoints/publicAccountEndpoints'
import { twoFactorEndpoints } from './endpoints/twoFactorEndpoints'
import { branding } from './branding'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const smtpHost = process.env.SMTP_HOST
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS

/**
 * Validates `SMTP_PORT` and returns the port to use. Mirrors the fail-fast
 * posture of `getS3StoragePlugin` below: an invalid value throws at config
 * load rather than silently coercing to a fallback. `undefined`/empty (the
 * expected dev/local state) resolves to Mailpit's default port; `"0"` is
 * treated as an explicit invalid value, not "unset", since port 0 is not a
 * usable SMTP port.
 */
function getSmtpPort(): number {
  const raw = process.env.SMTP_PORT
  if (raw === undefined || raw === '') {
    return 1025
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`SMTP_PORT must be a positive integer if set; received: "${raw}"`)
  }
  return parsed
}

/**
 * `next build` always runs with NODE_ENV=production (it's how Next.js
 * signals its own build optimizations), but Payload's config is also
 * evaluated during that build step (e.g. while collecting route data) —
 * long before any real SMTP configuration is relevant. Next sets
 * `NEXT_PHASE=phase-production-build` for the duration of `next build`
 * only (see `next/dist/build/index.js`), so we use it to scope the
 * fail-fast below to actual server boot (`next start` / the admin/API
 * runtime), not the build step itself.
 */
const isProductionBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

/**
 * Fails fast (throws) if running in production without `SMTP_HOST`, so a
 * production deployment can never silently boot against the dev-only
 * Mailpit relay (localhost:1025) and only discover the misconfiguration at
 * send time. Mirrors the S3 fail-fast in `getS3StoragePlugin` below.
 * Outside production, an unset `SMTP_HOST` still falls back to Mailpit —
 * dev/local behavior is unchanged.
 */
if (process.env.NODE_ENV === 'production' && !isProductionBuildPhase && !smtpHost) {
  throw new Error(
    'SMTP_HOST is required when NODE_ENV=production — refusing to silently fall back to the dev Mailpit relay (localhost:1025). Set SMTP_HOST (and SMTP_PORT/SMTP_USER/SMTP_PASS as needed).',
  )
}

/**
 * Fails fast if only one of SMTP_USER/SMTP_PASS is set, so partial auth
 * config is never silently dropped (the previous behavior of
 * `smtpUser && smtpPass ? { auth } : {}`).
 */
if ((smtpUser && !smtpPass) || (!smtpUser && smtpPass)) {
  throw new Error(
    'SMTP_USER and SMTP_PASS must both be set together, or both left unset — refusing to silently drop SMTP auth.',
  )
}

const smtpPort = getSmtpPort()

/**
 * Absolute base URL Payload uses to build every security-sensitive
 * absolute link it generates itself — most notably the password-reset
 * link in `renderForgotPasswordEmail` (`src/email/authEmails.ts`). Setting
 * this explicitly is what makes `req.payload.config.serverURL` available
 * and authoritative there, so link-building never needs to (and must not)
 * fall back to the caller-controllable `Origin` request header — see
 * `.superpowers/sdd/TODO/phase1-final-review.md` I-1 (CWE-640 host/
 * reset-link poisoning): an attacker could otherwise send
 * `POST /api/find-password` with a spoofed `Origin` header and have a
 * genuine reset email delivered with a reset link pointing at an
 * attacker-controlled host, leaking the valid reset token if clicked.
 * Defaults to `localhost:3000` for local dev only; always set
 * `PAYLOAD_PUBLIC_SERVER_URL` explicitly outside local development.
 */
const serverURL = (process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
)

/**
 * Builds the S3-compatible storage plugin. Fails fast (throws) if
 * `STORAGE_DRIVER=s3` but any required S3 env var is missing, so a
 * misconfigured deployment never silently falls back to local storage.
 */
function getS3StoragePlugin(): Plugin {
  const required = {
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  }
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=s3 requires the following env var(s), which are missing: ${missing.join(', ')}`,
    )
  }

  return s3Storage({
    collections: {
      media: true,
    },
    bucket: required.S3_BUCKET as string,
    config: {
      region: required.S3_REGION as string,
      credentials: {
        accessKeyId: required.S3_ACCESS_KEY_ID as string,
        secretAccessKey: required.S3_SECRET_ACCESS_KEY as string,
      },
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
  })
}

const storageDriver = process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local'
const plugins: Plugin[] = [
  ...(storageDriver === 's3' ? [getS3StoragePlugin()] : []),
  /**
   * Multi-tenant foundation (plan §2.1). `sites` is the tenants collection
   * (legacy 사이트 정보 관리). Nothing is tenant-scoped yet — `collections`
   * is deliberately empty. The installed plugin version (3.86.0) does NOT
   * require at least one tenant-enabled collection to boot: it only throws
   * if the tenants collection itself (`sites`) or an auth-enabled admin
   * users collection is missing (see
   * @payloadcms/plugin-multi-tenant/dist/index.js). Future tasks opt
   * individual collections in per docs/planning/development-plan.md §2.1's
   * tenant-scoped list (menus, boards, posts, web contents, banners,
   * popups, notification areas, surveys, terms, statistics, members).
   *
   * `userHasAccessToAllTenants: () => true` — everyone is effectively
   * super-admin until Task 1C/1D adds the roles/permission model.
   */
  multiTenantPlugin({
    // `boards` (Task 3A) is the first tenant-scoped collection: the plugin
    // adds a required `tenant` relationship → `sites`, so every board belongs
    // to exactly one site. Future tasks opt in posts, menus, web contents,
    // etc. per docs/planning/development-plan.md §2.1.
    collections: {
      boards: {},
    },
    tenantsSlug: Sites.slug,
    /**
     * SECURITY — gate writes to the plugin-added `users.tenants` array on
     * `system.admins`, exactly like the `roles` and `status` fields in
     * Users.ts. `users.update` is `selfOrMenuAccess`, so a user may PATCH
     * their own doc; without this field-level gate a non-super admin could
     * add any site to their OWN `tenants` and thereby self-grant access to
     * that site's boards — the same self-escalation hole that `roles`'
     * field-access closes (see task-1C-report.md), reopened for `tenants`.
     * `menuFieldAccess` honors `isSuper`; `overrideAccess` (seeds, the
     * account-request server create) bypasses it as usual. Users can still
     * edit their own name/email/password — only `tenants` is locked. `read`
     * is left default (a user may see their own tenant assignment, and the
     * plugin reads it for scoping).
     */
    tenantsArrayField: {
      arrayFieldAccess: {
        create: menuFieldAccess('system.admins'),
        update: menuFieldAccess('system.admins'),
      },
    },
    /**
     * INTENTIONALLY permissive — do NOT change to an `isSuper` check. This is
     * a SINGLE global switch that governs tenant scoping on every collection
     * the plugin touches, including the GLOBAL `users` and `sites` collections
     * (plan §2.1 keeps those menu-based, not tenant-scoped). Flipping it would
     * (1) tenant-scope `users`, breaking the menu-based `system.admins`
     * admin-manages-admin model, and (2) tenant-scope the `sites`
     * tenants-collection read, re-triggering the admin-UI-500 lockout that
     * Sites.ts's open-read decision fixed (phase1-final-review item 8). The
     * REAL per-user tenant enforcement (phase1-final-review item 2) lives on
     * each tenant-scoped collection's own `access` via
     * `tenantScopedMenuAccess` (src/access/tenantAccess.ts) — with this flag
     * left permissive, the plugin's `withTenantAccess` wrapper is a
     * pass-through that returns that function's result unchanged.
     */
    userHasAccessToAllTenants: () => true,
  }),
]

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      description: branding.tagline,
      titleSuffix: ` — ${branding.productName}`,
      icons: {
        icon: [
          { url: '/favicon.svg', type: 'image/svg+xml' },
          { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
        ],
        shortcut: '/favicon-32x32.png',
      },
    },
    components: {
      graphics: {
        Icon: '/components/branding/Icon#Icon',
        Logo: '/components/branding/Logo#Logo',
      },
      // Task 2C Part 3: idle auto-logout. Mounted globally on authenticated
      // admin views (actions render inside the auth/config context); a no-op on
      // the login view. See src/components/admin/IdleLogout.tsx.
      actions: ['/components/admin/IdleLogout#IdleLogout'],
      views: {
        // Task 2B: replace the built-in login view with a branded two-step
        // (password → Google-OTP) form that also shows the conditional
        // Account-Request / Find-ID / Find-PW links (ref 1-1). The actual 2FA
        // enforcement lives server-side in the `require2FA` beforeLogin gate —
        // this view is only the UI. `login` (lowercase) is the built-in
        // one-segment view key matched by @payloadcms/next's Root router.
        login: {
          Component: '/components/login/LoginView#LoginView',
        },
      },
    },
  },
  collections: [
    Users,
    Media,
    Sites,
    Departments,
    CodeClassifications,
    CodeGroups,
    Codes,
    // Board engine (Task 3A): global board types + tenant-scoped boards.
    BoardTypes,
    Boards,
    Roles,
    AdminMenus,
    PasswordPolicies,
    // Admin IP access control (Task 2C) — default-deny allowlist guarding the
    // admin back-office; enforced by src/proxy.ts via src/security/*.
    AdminIpRules,
    // Audit & logging backbone (Task 2A) — append-only, immutable, gated on
    // the privacy.* menuKeys. Written by src/audit/* via overrideAccess.
    AccessLogs,
    LoginHistory,
    PermissionChangeLogs,
    MenuPermissionLogs,
  ],
  // Public (unauthenticated) admin-account lifecycle endpoints (Task 1D):
  // /api/account-request, /api/find-id, /api/find-password. Plus the Task 2B
  // Google-OTP enrolment endpoints: /api/2fa/enroll, /api/2fa/verify-enroll,
  // /api/2fa/guide.
  endpoints: [...publicAccountEndpoints, ...twoFactorEndpoints],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  // See the `serverURL` const above (I-1 fix) — required so that
  // security-sensitive email links never fall back to the request Origin
  // header.
  serverURL,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  /**
   * Warms the `menuKey -> adminMenus id` cache that
   * `src/access/hasMenuAccess.ts`'s synchronous `hasMenuAccessSync` (used by
   * every gated collection's `admin.hidden`) depends on. `getPayload()`
   * does not hand back a usable instance until `onInit` resolves, and every
   * request handler awaits `getPayload()` first — so by the time any
   * request is served, this has already completed and there is no
   * cold-cache race. See the design-decision comment at the top of
   * hasMenuAccess.ts for the full reasoning (including why real
   * access-control decisions never depend on this cache at all).
   */
  onInit: async (payload) => {
    await warmAdminMenuKeyCache(payload)
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  email: nodemailerAdapter({
    defaultFromAddress: process.env.EMAIL_FROM_ADDRESS || branding.supportEmail,
    defaultFromName: process.env.EMAIL_FROM_NAME || branding.productName,
    transportOptions: {
      host: smtpHost || 'localhost',
      port: smtpPort,
      secure: process.env.SMTP_SECURE === 'true',
      ...(smtpUser && smtpPass ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
    },
  }),
  sharp,
  plugins,
})
