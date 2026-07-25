import type {
  CollectionBeforeValidateHook,
  CollectionConfig,
  TextFieldSingleValidation,
} from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../access/tenantAccess'
import { auditCollection } from '../audit/auditCollection'
import { generateShortCode, isValidRedirectTarget } from '../content/shortUrl'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const SHORT_URLS_MENU_KEY = 'content.shortUrls'

const shortUrlsAudit = auditCollection(SHORT_URLS_MENU_KEY)

/** How many times to regenerate a colliding code before deferring to the DB unique index. */
const MAX_CODE_ATTEMPTS = 5

/**
 * `originalUrl` validator (refs 1-42/1-43): required, and must be a valid
 * redirect target — an absolute http(s) URL (the usual short-link case) OR a
 * genuine site-relative internal link. Rejects dangerous schemes
 * (`javascript:`, `data:`…) and protocol-relative values so a stored short URL
 * can never become an XSS / open-redirect vector (the same target is re-checked
 * at redirect time — see `shortUrlRedirect.ts`). A custom `validate` REPLACES
 * Payload's default, so the required-empty case is handled explicitly.
 */
const validateOriginalUrl: TextFieldSingleValidation = (value) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'An original URL is required.'
  }
  if (!isValidRedirectTarget(value)) {
    return 'The URL must be an absolute http(s) URL or a site-relative path (/… or ?…) — no other schemes.'
  }
  return true
}

/**
 * Assigns the immutable `code` on create. Generates a random alphanumeric code
 * and regenerates on the rare collision (checked against existing codes);
 * the collection's `code` UNIQUE index is the race-condition backstop (the
 * loser of a concurrent insert trips `23505`, which Payload converts to a clean
 * 400 — the admin retries), exactly like the sequential-ID generators. Runs in
 * `beforeValidate` so the code is present before the field `unique` check.
 */
const assignShortCode: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (!data || operation !== 'create') {
    return data
  }
  if (typeof data.code === 'string' && data.code.length > 0) {
    return data
  }
  let code = generateShortCode()
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const clash = await req.payload.find({
      collection: 'shortUrls',
      where: { code: { equals: code } },
      limit: 1,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (clash.docs.length === 0) {
      break
    }
    code = generateShortCode()
  }
  data.code = code
  return data
}

/**
 * Legacy 짧은 URL 관리 (Short URL Management — refs 1-42/1-43). TENANT-SCOPED
 * (per-site) like boards: gated on `content.shortUrls` via
 * `tenantScopedMenuAccess`, with the create-time membership guard. The `code`
 * itself is GLOBALLY unique (not per-site) so the public `GET /s/:code` redirect
 * resolves a code unambiguously across every site.
 *
 * The public redirect route (`GET /s/:code`, plus `/api/s/:code`) 302s to
 * `originalUrl` after RE-validating the target — see `shortUrlRedirect.ts`.
 */
export const ShortUrls: CollectionConfig = {
  slug: 'shortUrls',
  admin: {
    group: 'Content',
    useAsTitle: 'linkName',
    defaultColumns: ['linkName', 'code', 'originalUrl', 'hitCount'],
    hidden: ({ user }) => !hasMenuAccessSync(user, SHORT_URLS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(SHORT_URLS_MENU_KEY),
    read: tenantScopedMenuAccess(SHORT_URLS_MENU_KEY),
    update: tenantScopedMenuAccess(SHORT_URLS_MENU_KEY),
    delete: tenantScopedMenuAccess(SHORT_URLS_MENU_KEY),
  },
  fields: [
    {
      name: 'linkName',
      type: 'text',
      required: true,
      admin: { description: 'Display name (링크명).' },
    },
    {
      name: 'originalUrl',
      type: 'text',
      required: true,
      validate: validateOriginalUrl,
      admin: {
        description: 'The destination the short link redirects to (absolute http(s) URL or /path).',
      },
    },
    { name: 'remarks', type: 'textarea', admin: { description: 'Optional notes (비고).' } },
    {
      name: 'code',
      type: 'text',
      unique: true,
      // System-generated, never client-set (mirrors boards.bbsId): field-level
      // write access denies every create/update. The beforeValidate hook sets
      // it via the normal (non-override) path; seeds pass it through with
      // overrideAccess.
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'Auto-generated globally-unique short code (used in /s/:code).',
      },
    },
    {
      name: 'hitCount',
      type: 'number',
      defaultValue: 0,
      // Best-effort counter bumped by the redirect route. Deliberately NOT
      // field-access-locked (like posts' downloadCount): a create/update:()=>false
      // would strip the redirect's own increment. It is `readOnly` in the UI.
      admin: { readOnly: true, description: 'Best-effort redirect hit counter.' },
    },
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard(), assignShortCode],
    afterChange: [shortUrlsAudit.afterChange],
    afterDelete: [shortUrlsAudit.afterDelete],
  },
}
