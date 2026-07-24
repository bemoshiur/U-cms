import type { CollectionConfig, Field, TextFieldSingleValidation } from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync, menuAccess } from '../access/hasMenuAccess'

/**
 * Legacy 사이트 정보 관리 (Site Info Management) footer item shape — each
 * footer field is independently toggleable: 사용중 (shown) / 미사용중
 * (hidden). See docs/analysis/feature-inventory.md "1-19)".
 */
function footerItem(name: string): Field {
  return {
    name,
    type: 'group',
    fields: [
      {
        name: 'value',
        type: 'text',
      },
      {
        name: 'show',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
  }
}

/** Image mimetypes the legacy site logo upload accepts (jpg, jpeg, png, gif). */
const ALLOWED_LOGO_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif']

/**
 * A custom `validate` on a field REPLACES Payload's default validator for
 * that field type entirely — including the required-empty check — rather
 * than layering on top of it (payload/dist/fields/config/sanitize.js only
 * auto-wraps the type's default validator, which is what enforces
 * `required`, when `field.validate` is `undefined`). Since these two
 * fields need custom format validation, `required` is threaded through
 * `options.required` and enforced by hand here — otherwise `''` would
 * satisfy Postgres's NOT NULL constraint and silently pass.
 */
const validateSiteId: TextFieldSingleValidation = (value, { required }) => {
  if (required && (typeof value !== 'string' || value.length === 0)) {
    return 'Site ID is required.'
  }
  if (typeof value === 'string' && value.length > 0 && !/^[a-z0-9]+$/.test(value)) {
    return 'Site ID must contain only lowercase letters and numbers (a-z, 0-9), e.g. "bos" or "demo".'
  }
  return true
}

const validateUrl: TextFieldSingleValidation = (value, { required }) => {
  if (required && (typeof value !== 'string' || value.length === 0)) {
    return 'URL is required.'
  }
  if (typeof value === 'string' && value.length > 0 && !/^https?:\/\//.test(value)) {
    return 'URL must start with http:// or https://'
  }
  return true
}

export const Sites: CollectionConfig = {
  slug: 'sites',
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['siteId', 'name', 'url', 'isAdminSite'],
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    // The *management* screen (this collection's list/edit views) is still
    // gated — see the `hidden` note on `read` below.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'system.sites'),
  },
  // `read` deliberately does NOT use `menuAccessConfig('system.sites')` for
  // all four ops, unlike every other gated collection — discovered via the
  // mandatory real login+admin-flow check (Task 1C brief's "LOCKOUT SAFETY"
  // requirement), not a hypothetical: `sites` is also the multi-tenant
  // plugin's `tenantsSlug`, and
  // `@payloadcms/plugin-multi-tenant/dist/providers/TenantSelectionProvider/index.js`
  // calls `payload.find({ collection: 'sites', overrideAccess: false, user })`
  // UNCONDITIONALLY on every single `/admin/*` page render, for every
  // authenticated user, regardless of that user's menu grants — it wraps
  // the whole admin layout, not just a sites-specific view. With `read`
  // gated behind `system.sites`, that call throws an uncaught `Forbidden`
  // for any admin lacking that one specific grant, which crashed (HTTP 500,
  // "Application error") the *entire* admin UI for that user — not just the
  // sites screens — verified by hitting `/admin` and
  // `/admin/collections/departments` (not even a tenant-related collection)
  // as a real roleless user and getting a 500 on both. So `read` is any
  // authenticated admin (still not anonymous/public — this differs from
  // `media`'s public-read exception in Media.ts, which is public because
  // uploads render on the *public* site); only the actual management
  // operations (create/update/delete) require the `system.sites` grant, and
  // `hidden` still keeps the management screen out of the nav for anyone
  // without it.
  access: {
    read: ({ req }) => Boolean(req.user),
    create: menuAccess('system.sites'),
    update: menuAccess('system.sites'),
    delete: menuAccess('system.sites'),
  },
  fields: [
    {
      name: 'siteId',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Lowercase alphanumeric identifier, e.g. "bos" or "demo".',
      },
      validate: validateSiteId,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'url',
      type: 'text',
      required: true,
      admin: {
        description: 'Full URL starting with http:// or https://',
      },
      validate: validateUrl,
    },
    {
      name: 'isAdminSite',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Marks this site as the admin back-office (legacy "bos") rather than a user-facing site.',
      },
    },
    // Feature toggles — user-facing sites only (legacy callouts 3/4/5, feature-inventory "1-18)").
    {
      name: 'satisfactionEnabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (_data, siblingData) => !siblingData?.isAdminSite,
      },
    },
    {
      name: 'dataManagerEnabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (_data, siblingData) => !siblingData?.isAdminSite,
      },
    },
    {
      name: 'accessibilityValidation',
      type: 'select',
      defaultValue: 'off',
      options: [
        // Mirrors legacy ACS_VLD_USE_CD: AVU001/AVU002/AVU003/AVU004.
        { label: 'Off', value: 'off' },
        { label: 'Popup alert', value: 'popup' },
        { label: 'Save to DB', value: 'db' },
        { label: 'Popup alert + Save to DB', value: 'popup_db' },
      ],
      admin: {
        condition: (_data, siblingData) => !siblingData?.isAdminSite,
        description:
          'Web accessibility validation usage (operates only in local/dev environments per legacy behavior).',
      },
    },
    // Admin-site-only toggles (legacy callout 6, feature-inventory "1-18)").
    {
      name: 'twoFactorEnabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (_data, siblingData) => Boolean(siblingData?.isAdminSite),
        description: 'Require a Google OTP code after login for this admin site.',
      },
    },
    {
      name: 'accountApplicationEnabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (_data, siblingData) => Boolean(siblingData?.isAdminSite),
        description: 'Allow admin account applications from the login page for this admin site.',
      },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      required: false,
      admin: {
        description: 'Homepage logo. Allowed types: jpg, jpeg, png, gif.',
      },
    },
    // Footer 영역 관리 (Footer Area Management) — feature-inventory "1-19)".
    // Kept flat and typed; the legacy postal-code lookup popup is a
    // frontend concern for a later task, not this data-model task.
    {
      name: 'footer',
      type: 'group',
      fields: [
        footerItem('orgName'),
        footerItem('addressPostalCode'),
        footerItem('addressLine1'),
        footerItem('addressLine2'),
        footerItem('phone'),
        footerItem('fax'),
        footerItem('copyright'),
      ],
    },
  ],
  hooks: {
    // `media` is a single shared upload collection used across the whole
    // app (not just site logos), so restricting its `upload.mimeTypes` to
    // images would wrongly block every other future use of `media`
    // (attachments, board images, etc. — see docs/planning/development-plan.md
    // §2.3). Instead, validate the logo's mimetype here, scoped to this one
    // relationship.
    beforeChange: [
      async ({ data, req }) => {
        if (!data?.logo) {
          return data
        }

        const logoId = typeof data.logo === 'object' ? data.logo.id : data.logo
        const logoDoc = await req.payload.findByID({
          collection: 'media',
          id: logoId,
          req,
          overrideAccess: true,
        })

        if (!logoDoc || !ALLOWED_LOGO_MIMETYPES.includes(logoDoc.mimeType ?? '')) {
          throw new APIError(
            `Site logo must be one of: jpg, jpeg, png, gif (received "${logoDoc?.mimeType ?? 'unknown'}").`,
            400,
          )
        }

        return data
      },
    ],
  },
}
