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
import { Roles } from './collections/Roles'
import { AdminMenus } from './collections/AdminMenus'
import { PasswordPolicies } from './collections/PasswordPolicies'
import { warmAdminMenuKeyCache } from './access/hasMenuAccess'
import { publicAccountEndpoints } from './endpoints/publicAccountEndpoints'
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
    collections: {},
    tenantsSlug: Sites.slug,
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
    Roles,
    AdminMenus,
    PasswordPolicies,
  ],
  // Public (unauthenticated) admin-account lifecycle endpoints (Task 1D):
  // /api/account-request, /api/find-id, /api/find-password.
  endpoints: publicAccountEndpoints,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
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
