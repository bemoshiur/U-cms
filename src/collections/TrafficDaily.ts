import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../access/tenantAccess'
import { TRAFFIC_DAILY_MENU_KEY, trafficStatsExportEndpoints } from '../endpoints/trafficExport'

/** Permanent menu-grant key gating this collection (shared with pageViews). */
export { TRAFFIC_DAILY_MENU_KEY }

/** Field-access lock: every field is server-forced (written only by the aggregation). */
const serverForced = { create: () => false, update: () => false } as const

/**
 * Aggregated per-(site, day) traffic rollup (Task 5A; TODO 5.1, refs 1-54 /
 * 2-17). ONE compact document per (site, calendar day), holding the day's total
 * page views, unique visitors, and the five breakdowns the statistics tabs
 * render (path/menu, OS, browser, device — period is the date axis itself).
 * TENANT-SCOPED and gated on `statistics.traffic`; written ONLY by the
 * aggregation job (`src/site/trafficAggregation.ts`), every field server-forced.
 *
 * ## Why a compact per-(site, day) doc (not a row per dimension-bucket)
 *
 * The breakdowns are stored as `json` arrays inside the one daily doc, so an
 * idempotent D-1 re-run is a single upsert on the `(tenant, date)` unique key
 * (no fan-out of rows to reconcile), and the stats views read a small, bounded
 * set of docs (one per day in range) instead of scanning raw `pageViews`.
 * Monthly = sum of daily by construction (see `src/content/trafficStats.ts`).
 *
 * ## Privacy (Phase-6-ready — aggregates hold NO PII)
 *
 * Only coarse counts by coarse dimension survive here: a canonical/bucketed path,
 * an OS/browser FAMILY, a device class, and two integers. No raw IP, UA, query,
 * session key, or member link is ever stored — the unique-visitor count is a
 * distinct-count of the raw daily session hashes computed at aggregation time
 * and then discarded. This is what lets raw `pageViews` be pruned (retention)
 * while these long-lived aggregates remain.
 */
export const TrafficDaily: CollectionConfig = {
  slug: 'trafficDaily',
  admin: {
    group: 'Statistics',
    useAsTitle: 'date',
    defaultColumns: ['date', 'totalViews', 'uniqueVisitors'],
    hidden: ({ user }) => !hasMenuAccessSync(user, TRAFFIC_DAILY_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(TRAFFIC_DAILY_MENU_KEY),
    read: tenantScopedMenuAccess(TRAFFIC_DAILY_MENU_KEY),
    update: tenantScopedMenuAccess(TRAFFIC_DAILY_MENU_KEY),
    delete: tenantScopedMenuAccess(TRAFFIC_DAILY_MENU_KEY),
  },
  // One rollup per (site, day) — the unique key makes the D-1 re-run an upsert.
  indexes: [{ fields: ['tenant', 'date'], unique: true }],
  endpoints: trafficStatsExportEndpoints,
  fields: [
    {
      name: 'date',
      type: 'text',
      required: true,
      access: serverForced,
      admin: { readOnly: true, description: 'UTC calendar day (YYYY-MM-DD) this rollup covers.' },
    },
    {
      name: 'totalViews',
      type: 'number',
      required: true,
      defaultValue: 0,
      access: serverForced,
      admin: { readOnly: true, description: 'Total page views on this site this day.' },
    },
    {
      name: 'uniqueVisitors',
      type: 'number',
      required: true,
      defaultValue: 0,
      access: serverForced,
      admin: {
        readOnly: true,
        description:
          'Distinct daily session hashes this day (session rotates daily — monthly unique = Σ daily).',
      },
    },
    {
      name: 'byPath',
      type: 'json',
      access: serverForced,
      admin: {
        readOnly: true,
        description: 'Path/menu breakdown: [{ path, menuNumber, views }] (Menu/Page tab).',
      },
    },
    {
      name: 'byOs',
      type: 'json',
      access: serverForced,
      admin: { readOnly: true, description: 'OS-family breakdown: [{ key, views }] (OS tab).' },
    },
    {
      name: 'byBrowser',
      type: 'json',
      access: serverForced,
      admin: {
        readOnly: true,
        description: 'Browser-family breakdown: [{ key, views }] (Browser tab).',
      },
    },
    {
      name: 'byDevice',
      type: 'json',
      access: serverForced,
      admin: {
        readOnly: true,
        description: 'Device-class breakdown: [{ key, views }] (Device tab).',
      },
    },
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard('tenant')],
    // NO audit hooks: machine-written rollups, re-run daily — auditing each
    // upsert would flood the access-history journal (same rationale as pageViews).
  },
}
