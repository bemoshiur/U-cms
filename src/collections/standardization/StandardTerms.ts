import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../../access/hasMenuAccess'
import { auditCollection } from '../../audit/auditCollection'
import {
  STANDARD_ENACTED_NOTICE,
  STANDARDIZATION_NAV_GROUP,
  STD_TERMS_MENU_KEY,
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
const standardTermsAudit = auditCollection(STD_TERMS_MENU_KEY)

/**
 * 표준 용어사전 (Standard Term Dictionary) — feature-inventory refs 1-64/1-65
 * (Phase 8, Task 8.1a). A term is a column-level business term (용어명) composed
 * of standard words and bound to exactly one domain (`boundDomain`), from which
 * its storage/display formats and allowed-values description derive. Term
 * abbreviations are underscore-joined word abbreviations (e.g. LVABSN_END_YMD =
 * 휴직종료일자).
 *
 * GLOBAL (non-tenant), gated on `standardization.terms` (DBA role). MOIS terms
 * ship as the enacted baseline; institution terms are registered. Enacted rows
 * are locked from direct edit/delete (see `lockStandard.ts`).
 *
 * Left for Task 8.1b: the register-screen abbreviation SEARCH that generates the
 * candidate domain list and AUTO-POPULATES 허용값설명/저장유형명/표시유형명 from the
 * bound domain (ref 1-65 callouts 3-4). Here those derived fields are stored as
 * plain read-only text (seeded from the bound domain for MOIS baseline rows);
 * the live auto-populate wiring is 8.1b.
 */
export const StandardTerms: CollectionConfig = {
  slug: 'standardTerms',
  admin: {
    group: STANDARDIZATION_NAV_GROUP,
    useAsTitle: 'termName',
    defaultColumns: ['standardSource', 'revision', 'termAbbreviation', 'termName', 'useStatus'],
    description: STANDARD_ENACTED_NOTICE,
    hidden: ({ user }) => !hasMenuAccessSync(user, STD_TERMS_MENU_KEY),
  },
  access: menuAccessConfig(STD_TERMS_MENU_KEY),
  fields: [
    standardSourceField,
    revisionField,
    {
      name: 'termAbbreviation',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          '용어약어명 (Term Abbreviation). Underscore-joined word abbreviations. e.g. LVABSN_END_YMD. Unique.',
      },
    },
    {
      name: 'termName',
      type: 'text',
      required: true,
      admin: { description: '용어명 (Term Name). e.g. 휴직종료일자.' },
    },
    {
      name: 'boundDomain',
      type: 'relationship',
      relationTo: 'standardDomains',
      admin: {
        description: '도메인명 (Bound Domain). The single domain this term binds to (ref 1-65).',
      },
    },
    {
      name: 'allowedValues',
      type: 'textarea',
      admin: {
        readOnly: true,
        description:
          '허용값설명 (Allowed-Values Description). Auto-derived from the bound domain (8.1b).',
      },
    },
    {
      name: 'storageFormat',
      type: 'text',
      admin: {
        readOnly: true,
        description: '저장유형명 (Storage Format). Auto-derived from the bound domain (8.1b).',
      },
    },
    {
      name: 'displayFormat',
      type: 'text',
      admin: {
        readOnly: true,
        description: '표시유형명 (Display Format). Auto-derived from the bound domain (8.1b).',
      },
    },
    {
      name: 'termDescription',
      type: 'textarea',
      admin: { description: '용어설명 (Term Description).' },
    },
    {
      name: 'standardAdminCodeName',
      type: 'text',
      admin: { description: '표준행정코드명 (Standard Administrative Code Name).' },
    },
    {
      name: 'competentAgency',
      type: 'text',
      admin: { description: '소관기관명 (Competent Agency Name).' },
    },
    {
      name: 'synonyms',
      type: 'textarea',
      admin: { description: '동의어목록 (Synonym List).' },
    },
    memoField,
    useStatusField,
    ...approvalFields,
    enactedField,
  ],
  hooks: {
    beforeChange: [lockEnactedBeforeChange],
    afterChange: [standardTermsAudit.afterChange],
    beforeDelete: [lockEnactedBeforeDelete],
    afterDelete: [standardTermsAudit.afterDelete],
  },
}
