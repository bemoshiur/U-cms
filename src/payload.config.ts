import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import type { Plugin } from 'payload'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Attachments } from './collections/Attachments'
import { Sites } from './collections/Sites'
import { Departments } from './collections/Departments'
import { CodeClassifications } from './collections/codes/CodeClassifications'
import { CodeGroups } from './collections/codes/CodeGroups'
import { Codes } from './collections/codes/Codes'
import { BoardTypes } from './collections/boards/BoardTypes'
import { Boards } from './collections/boards/Boards'
import { Posts } from './collections/posts/Posts'
import { ProfanityWords } from './collections/ProfanityWords'
import { MemberBannedWords } from './collections/MemberBannedWords'
import { Members } from './collections/Members'
import { NotificationAreas } from './collections/display/NotificationAreas'
import { Popups } from './collections/display/Popups'
import { Banners } from './collections/display/Banners'
import { AdminNotices } from './collections/display/AdminNotices'
import { GuideMenus } from './collections/display/GuideMenus'
import { Menus } from './collections/Menus'
import { WebContents } from './collections/WebContents'
import { TermsDocuments } from './collections/TermsDocuments'
import { SatisfactionRatings } from './collections/SatisfactionRatings'
import { PageViews } from './collections/PageViews'
import { TrafficDaily } from './collections/TrafficDaily'
import { ShortUrls } from './collections/ShortUrls'
import { HelpEntries } from './collections/HelpEntries'
import { Surveys } from './collections/surveys/Surveys'
import { SurveyQuestions } from './collections/surveys/SurveyQuestions'
import { SurveyResponses } from './collections/surveys/SurveyResponses'
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
import { fileEndpoints } from './endpoints/fileDownload'
import { shortUrlRedirectEndpoint } from './endpoints/shortUrlRedirect'
import { richTextEditor } from './richTextEditor'
import { branding } from './branding'
import { buildEmailAdapter } from './email/emailConfig'
import { resolvePublicServerURL } from './env/serverUrl'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Absolute base URL Payload uses to build every security-sensitive absolute
 * link it generates itself — most notably the password-reset link in
 * `renderForgotPasswordEmail` (`src/email/authEmails.ts`). Setting this
 * explicitly is what makes `req.payload.config.serverURL` available and
 * authoritative there, so link-building never needs to (and must not) fall
 * back to the caller-controllable `Origin` request header — see
 * `.superpowers/sdd/TODO/phase1-final-review.md` I-1 (CWE-640 host/reset-link
 * poisoning): an attacker could otherwise send `POST /api/find-password` with a
 * spoofed `Origin` header and have a genuine reset email delivered with a reset
 * link pointing at an attacker-controlled host, leaking the valid reset token
 * if clicked. Resolution (all server-controlled, never the request Origin) is
 * centralized in `resolvePublicServerURL`: PAYLOAD_PUBLIC_SERVER_URL →
 * SERVER_URL → VERCEL_URL (Vercel's own deployment host) → localhost:3000
 * (dev only). Always set PAYLOAD_PUBLIC_SERVER_URL to your STABLE production
 * domain outside local development.
 */
const serverURL = resolvePublicServerURL()

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
      // Public display-asset pool (logos, banner/popup images).
      media: true,
      // Tenant-scoped, access-controlled attachment pool (Task 4-zero). MUST be
      // covered too: on Vercel the local filesystem is ephemeral, so attachment
      // uploads have to land in the bucket, and `/api/files/download`'s S3 path
      // (src/endpoints/fileDownload.ts) serves bytes via THIS collection's
      // registered S3 static handler. The raw `/api/attachments/file/*` route
      // stays GUARDED + tenant-gated (never IP-exempt), so enabling S3 here does
      // not widen the access surface — only the byte SOURCE moves to the bucket.
      attachments: true,
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
      // Posts (Task 3B) — tenant-scoped like boards; a post's tenant is DERIVED
      // from its board's site in Posts.ts's beforeValidate. Real per-user
      // enforcement lives on the collection's own `access`
      // (tenantScopedMenuAccess) + the create-time membership guard, exactly
      // like boards — see src/access/tenantAccess.ts.
      posts: {},
      // Per-site display components (Task 3C) — notification areas, popups,
      // banners, admin notices, and guide menus are all tenant-scoped (ref 2-1:
      // the demo-site versions are per-site instances of the same programs).
      // Each reuses tenantScopedMenuAccess + tenantMembershipGuard.
      notificationAreas: {},
      popups: {},
      banners: {},
      adminNotices: {},
      guideMenus: {},
      // Menus + versioned web contents + short URLs (Task 3D) — all
      // tenant-scoped (per-site). `helpEntries` is GLOBAL (admin-system help,
      // plan §2.1) so it is deliberately NOT opted in here.
      menus: {},
      webContents: {},
      // Versioned privacy/terms documents (Task 4E; refs 2-14..2-16) —
      // tenant-scoped like webContents, with Payload versions+drafts. The
      // ONLY OTHER tenant-scoped collection with versions, so it also needs the
      // B1 `readVersions` scoping on `version.tenant` (see TermsDocuments.ts).
      termsDocuments: {},
      // Public satisfaction ratings + traffic capture (Task 4E; refs 2-18/2-19,
      // TODO 4.9) — tenant-scoped; both feed the Phase-5 statistics module.
      satisfactionRatings: {},
      pageViews: {},
      // Aggregated per-(site, day) traffic rollups (Task 5A; TODO 5.1) —
      // tenant-scoped, written by the aggregation job, read by the stats tabs.
      trafficDaily: {},
      shortUrls: {},
      // Survey system (Task 4D; refs 2-9..2-12) — all three tenant-scoped
      // (per-site). Questions/responses derive their tenant from the parent
      // survey; all gate on `content.surveys`.
      surveys: {},
      surveyQuestions: {},
      surveyResponses: {},
      // Access-controlled file pool (Task 4-zero) — board/post + admin-notice
      // attachments. Tenant-scoped so a Site-B admin cannot read Site-A's
      // (incl. secret) files; `media` is left as the PUBLIC display-asset pool.
      // See src/collections/Attachments.ts.
      attachments: {},
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
      // Task 5A: nav link to the custom Traffic Statistics view (a custom
      // top-level view has no auto nav entry). Hidden for users without the
      // statistics.traffic grant. See src/components/statistics/StatisticsNavLink.tsx.
      afterNavLinks: ['/components/statistics/StatisticsNavLink#StatisticsNavLink'],
      views: {
        // Task 5A (TODO 5.2): the traffic statistics dashboard (5 tabs), gated
        // on statistics.traffic + tenant-scoped. See TrafficStatisticsView.tsx.
        trafficStatistics: {
          Component: '/components/statistics/TrafficStatisticsView#TrafficStatisticsView',
          path: '/traffic-statistics',
          exact: true,
        },
        // Task 5B (TODO 5.3): download statistics (TOP-20 + detail), gated on
        // statistics.downloads + tenant-scoped. See DownloadStatisticsView.tsx.
        downloadStatistics: {
          Component: '/components/statistics/DownloadStatisticsView#DownloadStatisticsView',
          path: '/download-statistics',
          exact: true,
        },
        // Task 5B (TODO 5.4): satisfaction statistics (distribution + per-menu +
        // dept/menu cascade), gated on statistics.satisfaction + tenant-scoped.
        // See SatisfactionStatisticsView.tsx.
        satisfactionStatistics: {
          Component: '/components/statistics/SatisfactionStatisticsView#SatisfactionStatisticsView',
          path: '/satisfaction-statistics',
          exact: true,
        },
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
    // Tenant-scoped, access-controlled file pool (Task 4-zero): board/post +
    // admin-notice attachments live here, NOT in the public `media` pool.
    Attachments,
    Sites,
    Departments,
    CodeClassifications,
    CodeGroups,
    Codes,
    // Board engine (Task 3A): global board types + tenant-scoped boards.
    BoardTypes,
    Boards,
    // Content engine (Task 3B): tenant-scoped posts + global word-filter lists.
    Posts,
    ProfanityWords,
    MemberBannedWords,
    // Public-site MEMBER accounts (Task 4B) — a SEPARATE, tenant-scoped auth
    // collection from the admin `users`. A member session grants ZERO admin
    // access. NOT opted into the multi-tenant plugin (manual `tenant` field);
    // see src/collections/Members.ts.
    Members,
    // Per-site display components (Task 3C): notification areas, popups,
    // banners, admin notices, and guide menus — all tenant-scoped.
    NotificationAreas,
    Popups,
    Banners,
    AdminNotices,
    GuideMenus,
    // Menus + versioned web content + short URLs (Task 3D): tenant-scoped;
    // helpEntries is global.
    Menus,
    WebContents,
    // Versioned privacy/terms documents (Task 4E): tenant-scoped, versions+drafts.
    TermsDocuments,
    ShortUrls,
    HelpEntries,
    // Survey system (Task 4D): tenant-scoped surveys + questions + responses.
    Surveys,
    SurveyQuestions,
    SurveyResponses,
    // Public satisfaction ratings + traffic capture (Task 4E) — tenant-scoped;
    // both feed the Phase-5 statistics module.
    SatisfactionRatings,
    PageViews,
    // Aggregated per-(site, day) traffic rollups (Task 5A) — the statistics tabs
    // read these; written by the aggregation job (src/site/trafficAggregation.ts).
    TrafficDaily,
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
  endpoints: [
    ...publicAccountEndpoints,
    ...twoFactorEndpoints,
    ...fileEndpoints,
    // Public short-URL redirect (Task 3D): GET /api/s/:code (also served at the
    // pretty /s/:code via the (frontend) route handler). `/api/s` is exempt from
    // the admin IP guard — see src/security/adminIpEnforcement.ts.
    shortUrlRedirectEndpoint,
  ],
  // Shared richText editor — its UploadFeature is restricted to the GATED
  // `attachments` collection so embedded uploads never land in the public
  // `media` pool (Task 4-zero B2 hardening). See src/richTextEditor.ts.
  editor: richTextEditor,
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
  // Email transport posture (Task TR2 Part 3): prod+SMTP → real transport;
  // prod without SMTP → email DISABLED (no-op logging transport, never
  // localhost in prod); dev/build → Mailpit. See src/email/emailConfig.ts.
  email: buildEmailAdapter(),
  sharp,
  plugins,
})
