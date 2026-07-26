import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../access/tenantAccess'
import { auditCollection } from '../audit/auditCollection'
import { MAX_SCORE, MIN_SCORE } from '../content/satisfaction'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const SATISFACTION_MENU_KEY = 'statistics.satisfaction'

const satisfactionAudit = auditCollection(SATISFACTION_MENU_KEY)

/** Field-access lock: server-forced fields a client/admin-panel write can never set. */
const serverForced = { create: () => false, update: () => false } as const

/**
 * Like {@link serverForced} but ALSO `read:false`: the `ipHash` is a salted
 * dedup token — making it unreadable means it never leaves the server via any
 * API read/export, so it can't be correlated back to a visitor. The submit path
 * computes + compares it server-side (`where` filters still work — read access
 * gates OUTPUT, not query predicates); `overrideAccess` reads (tests) still see it.
 */
const secretServerField = { create: () => false, update: () => false, read: () => false } as const

/**
 * Legacy 만족도 (Satisfaction) per-page rating capture (Task 4E; refs 2-18/2-19).
 * TENANT-SCOPED (per-site) and gated on `statistics.satisfaction`. Every row is
 * built ENTIRELY server-side by the hardened public submit (`src/site/
 * satisfaction.ts`, via `overrideAccess`) and field-access-locked, so an
 * admin-panel/API write can never forge `tenant`/`menu`/`pageKey`/`score`/
 * `member`/`submittedAt`/`ipHash`. The ADMIN surface is read/manage only — the
 * feed for the Phase-5 satisfaction statistics dashboard (ref 2-19).
 *
 * Privacy: `ipHash` is a rotating salted HASH (never the raw IP) used only for a
 * best-effort one-per-participant dedup, and it is `read:false` so it never
 * leaves the server. `member` is null for an anonymous rater.
 */
export const SatisfactionRatings: CollectionConfig = {
  slug: 'satisfactionRatings',
  admin: {
    group: 'Statistics',
    useAsTitle: 'id',
    defaultColumns: ['menu', 'pageKey', 'score', 'submittedAt'],
    hidden: ({ user }) => !hasMenuAccessSync(user, SATISFACTION_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(SATISFACTION_MENU_KEY),
    read: tenantScopedMenuAccess(SATISFACTION_MENU_KEY),
    update: tenantScopedMenuAccess(SATISFACTION_MENU_KEY),
    delete: tenantScopedMenuAccess(SATISFACTION_MENU_KEY),
  },
  fields: [
    {
      name: 'menu',
      type: 'relationship',
      relationTo: 'menus',
      access: serverForced,
      admin: {
        readOnly: true,
        description: 'The rated page menu (per-menu satisfaction dimension, ref 2-19), or null.',
      },
    },
    {
      name: 'pageKey',
      type: 'text',
      required: true,
      access: serverForced,
      admin: { readOnly: true, description: 'The rated public page path (server-forced).' },
    },
    {
      name: 'score',
      type: 'number',
      required: true,
      min: MIN_SCORE,
      max: MAX_SCORE,
      access: serverForced,
      admin: { readOnly: true, description: '5-point satisfaction score (1-5, server-validated).' },
    },
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      access: serverForced,
      admin: { readOnly: true, description: 'The member who rated, or null (anonymous).' },
    },
    {
      name: 'submittedAt',
      type: 'date',
      access: serverForced,
      admin: { readOnly: true, description: 'Server-stamped submission time.' },
    },
    {
      name: 'ipHash',
      type: 'text',
      access: secretServerField,
      admin: {
        readOnly: true,
        description: 'Server-only salted dedup hash (never read back) — stores NO raw IP.',
      },
    },
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard('tenant')],
    afterChange: [satisfactionAudit.afterChange],
    afterDelete: [satisfactionAudit.afterDelete],
  },
}
