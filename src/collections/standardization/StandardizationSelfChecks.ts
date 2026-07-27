import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../../access/hasMenuAccess'
import { auditCollection } from '../../audit/auditCollection'
import { standardizationEngineEndpoints } from '../../endpoints/standardizationEngineExport'
import {
  SELF_CHECK_ERROR_TYPES,
  STANDARD_SOURCE_OPTIONS,
  STANDARDIZATION_NAV_GROUP,
  STD_SELF_CHECK_MENU_KEY,
} from '../../standardization/constants'
import { enforceCurrentYearMonthOnly } from './selfCheckGuard'

/** Access-history audit hooks (Task 2A) for self-check snapshot writes. */
const selfCheckAudit = auditCollection(STD_SELF_CHECK_MENU_KEY, {
  menuLabel: '표준화 자가점검 (Standardization Self-Check)',
})

/** The eight `error<N>Count` numeric columns (오류1..오류8). */
const errorCountFields = SELF_CHECK_ERROR_TYPES.map((e) => ({
  name: `${e.id}Count`,
  type: 'number' as const,
  defaultValue: 0,
  admin: { description: `${e.label} — ${e.description}` },
}))

/**
 * 표준화 자가점검 결과 (Standardization Self-Check Results) — feature-inventory ref
 * 1-75 (Phase 8, Task 8.1b). One snapshot per (점검연월 check year-month, 표준출처
 * standard source): the eight error-type counts (오류1..오류8) plus the detailed
 * violating table/column rows (denormalized in `details` JSON for the detail
 * popup). The "표준화 점검 / Run Check" action re-runs the live introspection and
 * (over)writes ONLY the current year-month; earlier months are reference-only
 * (enforced by `enforceCurrentYearMonthOnly`). Snapshots feed the 1-76 statistics.
 *
 * GLOBAL (non-tenant), DBA-only (gated on `standardization.selfCheck`). Unique on
 * (checkYearMonth, standardSource) so each month/source has exactly one snapshot.
 */
export const StandardizationSelfChecks: CollectionConfig = {
  slug: 'standardizationSelfChecks',
  admin: {
    group: STANDARDIZATION_NAV_GROUP,
    useAsTitle: 'checkYearMonth',
    defaultColumns: ['checkYearMonth', 'standardSource', 'error1Count', 'error5Count', 'checkedAt'],
    description:
      '표준화 자가점검 결과 (Self-Check Results). Only the current check year-month is (re)writable; earlier months are reference-only.',
    hidden: ({ user }) => !hasMenuAccessSync(user, STD_SELF_CHECK_MENU_KEY),
  },
  access: menuAccessConfig(STD_SELF_CHECK_MENU_KEY),
  indexes: [{ fields: ['checkYearMonth', 'standardSource'], unique: true }],
  fields: [
    {
      name: 'checkYearMonth',
      type: 'text',
      required: true,
      index: true,
      admin: { description: '점검연월 (Check year-month) as YYYYMM. e.g. 202607.' },
    },
    {
      name: 'standardSource',
      type: 'select',
      required: true,
      options: [...STANDARD_SOURCE_OPTIONS],
      defaultValue: 'mois',
      admin: { description: '표준출처 (Standard Source).' },
    },
    ...errorCountFields,
    {
      name: 'checkedAt',
      type: 'date',
      admin: { description: '점검일 (Check timestamp).' },
    },
    {
      name: 'details',
      type: 'json',
      admin: {
        description:
          '오류 상세 (Violating table/column rows) — [{tableName, columnName, logicalName, dataType, domain, errorType}] for the detail popup.',
      },
    },
    {
      name: 'note',
      type: 'text',
      admin: { description: '비고 (Note).' },
    },
  ],
  hooks: {
    beforeChange: [enforceCurrentYearMonthOnly],
    afterChange: [selfCheckAudit.afterChange],
    afterDelete: [selfCheckAudit.afterDelete],
  },
  // The standardization engine: meta-inspection (1-66) + self-check list/run
  // (1-75) + statistics (1-76). Each endpoint self-gates on its own menuKey.
  endpoints: standardizationEngineEndpoints,
}
