import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../../access/hasMenuAccess'
import { auditCollection } from '../../audit/auditCollection'
import {
  DATA_TYPE_OPTIONS,
  STANDARD_ENACTED_NOTICE,
  STANDARDIZATION_NAV_GROUP,
  STD_DOMAINS_MENU_KEY,
} from '../../standardization/constants'
import { lockEnactedBeforeChange, lockEnactedBeforeDelete } from './lockStandard'
import {
  approvalFields,
  enactedField,
  memoField,
  revisionField,
  standardSourceField,
  useStatusField,
} from './sharedFields'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const standardDomainsAudit = auditCollection(STD_DOMAINS_MENU_KEY)

/**
 * 표준 도메인사전 (Standard Domain Dictionary) — feature-inventory refs 1-60/1-61
 * (Phase 8, Task 8.1a). A domain defines the physical shape (data type, length,
 * decimal places, storage/display format masks, unit, allowed values) that a
 * standard TERM binds to. MOIS (행정안전부) public-database domains ship as the
 * baseline (`enacted: true`, seeded); institutions register their own via the
 * admin UI (`enacted: false`).
 *
 * GLOBAL (non-tenant) — a standardization dictionary is shared across all sites,
 * per docs/planning/development-plan.md §2.2. Modeled like `Roles`/`Codes`, NOT
 * like `Posts`: no tenant field, gated purely on the `standardization.domains`
 * menu grant (which the DBA role holds). Menu-gating means it inherits the
 * Phase-7 2FA-enrolment confinement automatically (see hasMenuAccess.ts).
 *
 * Business rules (ref 1-61): the domain name encodes 도메인그룹 + 자료유형 약자 +
 * 자료길이 (e.g. 금액N17 = Amount / NUMERIC / 17; 연월일C8 = Date / CHAR / 8) — a
 * convention documented on the field, NOT a rigid parser. Enacted standard rows
 * cannot be directly edited/deleted (see `lockStandard.ts`); the human notice is
 * surfaced via `admin.description`. The edit/discard PROPOSAL workflow is Task
 * 8.1b — not built here.
 */
export const StandardDomains: CollectionConfig = {
  slug: 'standardDomains',
  admin: {
    group: STANDARDIZATION_NAV_GROUP,
    useAsTitle: 'domainName',
    defaultColumns: [
      'standardSource',
      'revision',
      'domainGroup',
      'domainName',
      'dataType',
      'useStatus',
    ],
    description: STANDARD_ENACTED_NOTICE,
    hidden: ({ user }) => !hasMenuAccessSync(user, STD_DOMAINS_MENU_KEY),
  },
  access: menuAccessConfig(STD_DOMAINS_MENU_KEY),
  fields: [
    standardSourceField,
    revisionField,
    {
      name: 'domainGroup',
      type: 'text',
      required: true,
      admin: { description: '도메인그룹명 (Domain Group Name). e.g. 금액, 날짜/시간.' },
    },
    {
      name: 'classification',
      type: 'text',
      required: true,
      admin: { description: '도메인분류명 (Domain Classification Name). e.g. 금액, 비용, 연월일.' },
    },
    {
      name: 'domainName',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          '도메인명 (Domain Name) = 도메인그룹 + 자료유형 약자(N/C/V/T) + 자료길이. e.g. 금액N17, 연월일C8. Unique.',
      },
    },
    {
      name: 'dataType',
      type: 'select',
      required: true,
      options: [...DATA_TYPE_OPTIONS],
      admin: { description: '자료유형 (Data Type).' },
    },
    {
      name: 'dataLength',
      type: 'number',
      admin: { description: '자료길이 (Data Length). e.g. 17.' },
    },
    {
      name: 'decimalPlaces',
      type: 'number',
      admin: { description: '소수점자릿수 (Decimal Places). e.g. 2 for a 22.2 numeric.' },
    },
    {
      name: 'storageFormat',
      type: 'text',
      admin: {
        description: '저장유형명 (Storage Format mask). e.g. 99,999,999,999,999,900, YYYYMMDD.',
      },
    },
    {
      name: 'displayFormat',
      type: 'text',
      admin: { description: '표시유형명 (Display Format mask).' },
    },
    {
      name: 'unitName',
      type: 'text',
      admin: { description: '단위명 (Unit Name). e.g. 원/KRW.' },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: '도메인설명 (Domain Description).' },
    },
    {
      name: 'allowedValues',
      type: 'textarea',
      admin: {
        description:
          "허용값설명 (Allowed-Values Description). e.g. 'YYYY : 0001-9999, MM : 01-12'.",
      },
    },
    memoField,
    useStatusField,
    ...approvalFields,
    enactedField,
  ],
  hooks: {
    beforeChange: [lockEnactedBeforeChange],
    afterChange: [standardDomainsAudit.afterChange],
    beforeDelete: [lockEnactedBeforeDelete],
    afterDelete: [standardDomainsAudit.afterDelete],
  },
}
