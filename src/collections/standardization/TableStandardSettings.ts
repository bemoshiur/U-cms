import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../../access/hasMenuAccess'
import { auditCollection } from '../../audit/auditCollection'
import { tableStandardEndpoints } from '../../endpoints/tableStandardEndpoints'
import {
  STANDARDIZATION_PROPOSAL_NAV_GROUP,
  STD_TABLE_SETTINGS_MENU_KEY,
  TABLE_SOURCE_OPTIONS,
} from '../../standardization/constants'

/** Access-history audit hooks (Task 2A) for table-standard assignment changes. */
const tableSettingsAudit = auditCollection(STD_TABLE_SETTINGS_MENU_KEY, {
  menuLabel: '테이블 표준 설정 (Table Standard Settings)',
})

/**
 * 테이블 표준 설정 (Table Standard Settings) — feature-inventory ref 1-67 (Phase 8,
 * Task 8.1b). One row per physical DB table, assigning the standardization source
 * it must conform to — 행정안전부 (MOIS) / 기관 (institution) / 제외 (excluded) /
 * 미지정 (unassigned). The assigned source governs which dictionary + which rules
 * a table is validated against in the self-check (1-75).
 *
 * GLOBAL (non-tenant), DBA-only (gated on `standardization.tableSettings`). The
 * live table list is introspected (see `standardizationIntrospection.ts`); the
 * custom view merges the live tables with these stored assignments, offers batch
 * apply (일괄적용) via the endpoint, and totals per-source summary counts. Rows are
 * keyed by the unique physical `tableName`.
 */
export const TableStandardSettings: CollectionConfig = {
  slug: 'tableStandardSettings',
  admin: {
    group: STANDARDIZATION_PROPOSAL_NAV_GROUP,
    useAsTitle: 'tableName',
    defaultColumns: ['tableName', 'tableCategory', 'tableDescription', 'standardSource'],
    hidden: ({ user }) => !hasMenuAccessSync(user, STD_TABLE_SETTINGS_MENU_KEY),
  },
  access: menuAccessConfig(STD_TABLE_SETTINGS_MENU_KEY),
  fields: [
    {
      name: 'tableName',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: '테이블명 (Physical table name). Unique.' },
    },
    {
      name: 'tableCategory',
      type: 'text',
      defaultValue: '기본',
      admin: { description: '테이블구분 (Table category). e.g. 기본 (basic).' },
    },
    {
      name: 'tableDescription',
      type: 'text',
      admin: { description: '테이블설명 (Table description / logical name).' },
    },
    {
      name: 'standardSource',
      type: 'select',
      required: true,
      options: [...TABLE_SOURCE_OPTIONS],
      defaultValue: 'unassigned',
      admin: {
        description: '표준출처 (Standard Source): MOIS / institution / excluded / unassigned.',
      },
    },
    {
      name: 'physicalCreatedAt',
      type: 'text',
      admin: { description: '테이블 생성일 (Physical table creation date, informational).' },
    },
    {
      name: 'memo',
      type: 'textarea',
      admin: { description: '메모 (Memo).' },
    },
  ],
  hooks: {
    afterChange: [tableSettingsAudit.afterChange],
    afterDelete: [tableSettingsAudit.afterDelete],
  },
  // Live table list (introspected) + batch apply (일괄적용) + CSV, all gated on
  // standardization.tableSettings. See src/endpoints/tableStandardEndpoints.ts.
  endpoints: tableStandardEndpoints,
}
