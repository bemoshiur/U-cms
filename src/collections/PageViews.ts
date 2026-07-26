import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../access/tenantAccess'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const PAGE_VIEWS_MENU_KEY = 'statistics.traffic'

/** Field-access lock: server-forced fields a client/admin-panel write can never set. */
const serverForced = { create: () => false, update: () => false } as const

/**
 * Server-only salted session hash — never readable via any API/export, so it
 * can't be correlated back to a visitor (defense in depth; it's derived from a
 * daily-rotating salt over the coarse IP+UA and never stored as PII).
 */
const secretServerField = { create: () => false, update: () => false, read: () => false } as const

/**
 * Public traffic capture log (Task 4E; TODO 4.9). An append-only, PRIVACY-
 * CONSCIOUS visit log that feeds the Phase-5 statistics module (refs 2-17/2-20).
 * TENANT-SCOPED (per-site) and gated on `statistics.traffic`. Written ONLY by the
 * capture seam (`src/site/traffic.ts` → the `/track` beacon), with every field
 * server-forced.
 *
 * ## Privacy posture (Phase-6-ready — NO PII, unlike legacy 사이트 접속 이력)
 *
 * Stores NONE of: raw IP, full URL/query string, referrer path, UA string, an OS
 * or browser VERSION, or member identity. It keeps only a coarse `deviceType`
 * (mobile|desktop), coarse `osFamily`/`browserFamily` (family only, NO version —
 * Task 5A), the request `path` CANONICALIZED to the site's real routes (unknown
 * paths bucket to `__other__`, so an attacker can't mint unbounded fake pages —
 * D6), the referrer HOST only, and a rotating salted `sessionKey` HASH that is
 * `read:false`. This is the data the Phase-6 privacy subsystem requires to be
 * PII-free — see `src/content/traffic.ts` for the derivations.
 *
 * ## Phase-5 seam
 *
 * This task provides the DATA MODEL + capture only. The statistics AGGREGATION
 * (period / menu / device dashboards, ref 2-17) and the download-count /
 * satisfaction rollups are Phase 5, which reads these rows.
 */
export const PageViews: CollectionConfig = {
  slug: 'pageViews',
  admin: {
    group: 'Statistics',
    useAsTitle: 'path',
    defaultColumns: ['path', 'deviceType', 'menu', 'ts'],
    hidden: ({ user }) => !hasMenuAccessSync(user, PAGE_VIEWS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(PAGE_VIEWS_MENU_KEY),
    read: tenantScopedMenuAccess(PAGE_VIEWS_MENU_KEY),
    update: tenantScopedMenuAccess(PAGE_VIEWS_MENU_KEY),
    delete: tenantScopedMenuAccess(PAGE_VIEWS_MENU_KEY),
  },
  // Index the dimensions Phase-5 aggregates on (per-site period + per-menu).
  indexes: [{ fields: ['tenant', 'ts'] }, { fields: ['tenant', 'menu'] }],
  fields: [
    {
      name: 'path',
      type: 'text',
      required: true,
      access: serverForced,
      admin: { readOnly: true, description: 'Captured public path (query string stripped).' },
    },
    {
      name: 'menu',
      type: 'relationship',
      relationTo: 'menus',
      access: serverForced,
      admin: {
        readOnly: true,
        description: 'The owning menu (resolved for /page/{menuNumber} paths), or null.',
      },
    },
    {
      name: 'deviceType',
      type: 'select',
      options: [
        { label: 'Mobile', value: 'mobile' },
        { label: 'Desktop', value: 'desktop' },
      ],
      access: serverForced,
      admin: {
        readOnly: true,
        description: 'Coarse device class from the UA.',
      },
    },
    {
      // Task 5A: coarse OS FAMILY only (windows|macos|ios|android|linux|other) —
      // NO version, so it aggregates the ref-2-17 OS tab without fingerprinting.
      name: 'osFamily',
      type: 'select',
      options: [
        { label: 'Windows', value: 'windows' },
        { label: 'macOS', value: 'macos' },
        { label: 'iOS', value: 'ios' },
        { label: 'Android', value: 'android' },
        { label: 'Linux', value: 'linux' },
        { label: 'Other', value: 'other' },
      ],
      access: serverForced,
      admin: {
        readOnly: true,
        description: 'Coarse OS family derived from the UA (no version — privacy-safe).',
      },
    },
    {
      // Task 5A: coarse BROWSER FAMILY only — NO version (ref-2-17 browser tab).
      name: 'browserFamily',
      type: 'select',
      options: [
        { label: 'Chrome', value: 'chrome' },
        { label: 'Safari', value: 'safari' },
        { label: 'Firefox', value: 'firefox' },
        { label: 'Edge', value: 'edge' },
        { label: 'Opera', value: 'opera' },
        { label: 'Samsung Internet', value: 'samsung' },
        { label: 'Internet Explorer', value: 'ie' },
        { label: 'Other', value: 'other' },
      ],
      access: serverForced,
      admin: {
        readOnly: true,
        description: 'Coarse browser family derived from the UA (no version — privacy-safe).',
      },
    },
    {
      name: 'referrerHost',
      type: 'text',
      access: serverForced,
      admin: { readOnly: true, description: 'Referrer HOST only (never the full referring URL).' },
    },
    {
      name: 'sessionKey',
      type: 'text',
      access: secretServerField,
      admin: { readOnly: true, description: 'Server-only rotating salted hash — stores NO PII.' },
    },
    {
      name: 'ts',
      type: 'date',
      required: true,
      access: serverForced,
      admin: { readOnly: true, description: 'Server-stamped view time.' },
    },
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard('tenant')],
    // NO audit hooks: this is a high-volume traffic log; audit-logging every
    // insert would double the write load and pollute the access-history journal.
  },
}
