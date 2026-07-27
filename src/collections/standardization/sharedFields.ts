import type { Field, FieldAccess } from 'payload'

import { isSuperUser } from '../../access/hasMenuAccess'
import {
  APPROVAL_STATUS_OPTIONS,
  STANDARD_SOURCE_OPTIONS,
  USE_STATUS_OPTIONS,
} from '../../standardization/constants'

/**
 * Shared field builders for the three standardization dictionaries
 * (`standardDomains` / `standardWords` / `standardTerms`). Keeping the source /
 * revision / use-status / approval-metadata / enacted fields in one place means
 * the three collections stay in lock-step and the int tests assert against a
 * single definition (mirrors how `logCollection.ts` shares audit primitives).
 */

/**
 * Field-level write gate: only a super-admin (or an `overrideAccess` caller such
 * as the seed) may set a field. Used for `enacted` — the authority-only marker
 * that flips a row into the "cannot be edited/deleted directly" standard state.
 * A DBA registering an institution entry therefore can never mint an enacted
 * (baseline) row through the API, closing the field-level bypass of the lock.
 */
export const superOnlyFieldAccess: FieldAccess = ({ req }) => isSuperUser(req.user)

/** 표준출처* (Standard Source) — required select; MOIS entries are the baseline. */
export const standardSourceField: Field = {
  name: 'standardSource',
  type: 'select',
  required: true,
  options: [...STANDARD_SOURCE_OPTIONS],
  defaultValue: 'institution',
  admin: {
    description: '표준출처 (Standard Source). MOIS = 행정안전부 baseline; Institution = 기관.',
  },
}

/** 개정차수 (Revision) — free text (e.g. "1차".."6차", or "기관생성" for institution). */
export const revisionField: Field = {
  name: 'revision',
  type: 'text',
  admin: {
    description: '개정차수 (Revision). e.g. "6차"; institution-created entries carry "기관생성".',
  },
}

/** 사용여부* (Use Status) — required select, defaults to used. */
export const useStatusField: Field = {
  name: 'useStatus',
  type: 'select',
  required: true,
  options: [...USE_STATUS_OPTIONS],
  defaultValue: 'used',
  admin: { description: '사용여부 (Use Status).' },
}

/**
 * 승인여부 / 승인일시 / 승인아이디 — approval metadata, shown READ-ONLY (refs
 * 1-61/1-63/1-65). The real approval MUTATION is Task 8.1b's proposal workflow;
 * here these are display-only (the seed sets them for MOIS baseline rows).
 */
export const approvalFields: Field[] = [
  {
    name: 'approvalStatus',
    type: 'select',
    options: [...APPROVAL_STATUS_OPTIONS],
    defaultValue: 'pending',
    admin: {
      readOnly: true,
      description: '승인여부 (Approval status). Read-only — set via the 8.1b proposal workflow.',
    },
  },
  {
    name: 'approvedAt',
    type: 'date',
    admin: { readOnly: true, description: '승인일시 (Approval datetime). Read-only.' },
  },
  {
    name: 'approverId',
    type: 'text',
    admin: { readOnly: true, description: '승인아이디 (Approver ID). Read-only.' },
  },
]

/**
 * `enacted` — the authority-only marker for a MOIS baseline / enacted standard
 * row. When true, the row cannot be directly edited or deleted (see
 * `lockStandard.ts`); changes flow through the 8.1b proposal workflow.
 * admin-readOnly (UI can't set it) AND super-only field access (API can't set
 * it without `overrideAccess`).
 */
export const enactedField: Field = {
  name: 'enacted',
  type: 'checkbox',
  defaultValue: false,
  access: { create: superOnlyFieldAccess, update: superOnlyFieldAccess },
  admin: {
    readOnly: true,
    description:
      '제정 (Enacted standard). When set, this row is a baseline standard and cannot be edited/deleted directly — changes go through the 8.1b proposal workflow.',
  },
}

/** 메모내용 (Memo) — free-text management note, shared across all three dicts. */
export const memoField: Field = {
  name: 'memo',
  type: 'textarea',
  admin: { description: '메모내용 (Memo content).' },
}
