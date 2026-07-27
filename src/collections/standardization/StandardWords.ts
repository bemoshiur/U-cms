import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../../access/hasMenuAccess'
import { auditCollection } from '../../audit/auditCollection'
import {
  STANDARD_ENACTED_NOTICE,
  STANDARDIZATION_NAV_GROUP,
  STD_WORDS_MENU_KEY,
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
const standardWordsAudit = auditCollection(STD_WORDS_MENU_KEY)

/**
 * 표준 단어사전 (Standard Word Dictionary) — feature-inventory refs 1-62/1-63
 * (Phase 8, Task 8.1a). A word is the atomic vocabulary (abbreviation ↔ Korean
 * ↔ English) from which standard TERMS are composed. Optionally a word carries a
 * domain classification (which makes the word usable as a domain), a synonym
 * list, and a forbidden-word (금칙어) list for standardization enforcement.
 *
 * GLOBAL (non-tenant), gated on `standardization.words` (DBA role). MOIS words
 * ship as the enacted baseline; institution words are registered (revision =
 * 기관생성). Enacted rows are locked from direct edit/delete (see
 * `lockStandard.ts`); the proposal workflow is Task 8.1b.
 */
export const StandardWords: CollectionConfig = {
  slug: 'standardWords',
  admin: {
    group: STANDARDIZATION_NAV_GROUP,
    useAsTitle: 'abbreviation',
    defaultColumns: [
      'standardSource',
      'revision',
      'abbreviation',
      'koreanName',
      'englishName',
      'useStatus',
    ],
    description: STANDARD_ENACTED_NOTICE,
    hidden: ({ user }) => !hasMenuAccessSync(user, STD_WORDS_MENU_KEY),
  },
  access: menuAccessConfig(STD_WORDS_MENU_KEY),
  fields: [
    standardSourceField,
    revisionField,
    {
      name: 'abbreviation',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: '단어약어명 (Word Abbreviation). e.g. MBRCO, YMD, YN. Unique.' },
    },
    {
      name: 'koreanName',
      type: 'text',
      required: true,
      admin: { description: '단어한글명 (Word Korean Name). e.g. 회원사.' },
    },
    {
      name: 'englishName',
      type: 'text',
      required: true,
      admin: { description: '단어영문명 (Word English Name). e.g. Member Company.' },
    },
    {
      name: 'isFormalWord',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: '형식단어여부 (Formal-Word Status).' },
    },
    {
      name: 'domainClassification',
      type: 'text',
      admin: {
        description:
          '도메인분류명 (Domain Classification Name). If set, the word is usable as a domain (ref 1-63).',
      },
    },
    {
      name: 'synonyms',
      type: 'textarea',
      admin: { description: '동의어목록 (Synonym List). One per line or comma-separated.' },
    },
    {
      name: 'forbiddenWords',
      type: 'textarea',
      admin: { description: '금칙어목록 (Forbidden-Word List).' },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: '단어설명 (Word Description).' },
    },
    memoField,
    useStatusField,
    ...approvalFields,
    enactedField,
  ],
  hooks: {
    beforeChange: [lockEnactedBeforeChange],
    afterChange: [standardWordsAudit.afterChange],
    beforeDelete: [lockEnactedBeforeDelete],
    afterDelete: [standardWordsAudit.afterDelete],
  },
}
