import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../../access/hasMenuAccess'
import { auditCollection } from '../../audit/auditCollection'
import {
  APPROVAL_STATUS_OPTIONS,
  PROPOSAL_KIND_OPTIONS,
  PROPOSAL_TARGET_OPTIONS,
  STANDARD_ENACTED_NOTICE,
  STANDARD_SOURCE_OPTIONS,
  STANDARDIZATION_PROPOSAL_NAV_GROUP,
  STD_PROPOSALS_MENU_KEY,
} from '../../standardization/constants'
import { applyProposalOnApprove } from './proposalApply'

/** Access-history audit hooks (Task 2A) for every proposal mutation. */
const proposalsAudit = auditCollection(STD_PROPOSALS_MENU_KEY, {
  menuLabel: '공공데이터 표준화 제안 (Standardization Proposal)',
})

/**
 * 공공데이터 표준화 제안 (Standardization Proposal) — feature-inventory refs
 * 1-68..1-73 (Phase 8, Task 8.1b). ONE polymorphic DBA work-queue over the three
 * dictionaries (keyed by `target`), rather than three parallel collections.
 * Enacted-standard entries can't be edited directly (8.1a's lock); instead a
 * proposal (register / edit / discard) is submitted, and the DBA processes it —
 * on APPROVE, `applyProposalOnApprove` writes the change to the target dictionary
 * via the bypass-lock seam (transactional + idempotent + logged).
 *
 * GLOBAL (non-tenant), gated on `standardization.proposals` — the whole 제안관리
 * menu group is DBA-only (inherits the Phase-7 2FA confinement via menu gating,
 * so approval is a DBA-only action without a bespoke access fn). The proposed
 * attribute set is snapshotted in `proposedPayload` (JSON), and `targetEntryId`
 * scalar-references the existing dictionary row for edit/discard (no polymorphic
 * `_rels` table needed — the snapshot is the source of truth for the apply).
 */
export const StandardizationProposals: CollectionConfig = {
  slug: 'standardizationProposals',
  admin: {
    group: STANDARDIZATION_PROPOSAL_NAV_GROUP,
    useAsTitle: 'proposedName',
    defaultColumns: [
      'proposalKind',
      'target',
      'standardSource',
      'proposedName',
      'approvalStatus',
      'approvedAt',
    ],
    description:
      STANDARD_ENACTED_NOTICE +
      ' Set 승인여부 (approvalStatus) to 승인 (approved) and save to apply this proposal to the dictionary.',
    hidden: ({ user }) => !hasMenuAccessSync(user, STD_PROPOSALS_MENU_KEY),
  },
  access: menuAccessConfig(STD_PROPOSALS_MENU_KEY),
  fields: [
    {
      name: 'target',
      type: 'select',
      required: true,
      options: [...PROPOSAL_TARGET_OPTIONS],
      admin: { description: '제안 대상 사전 (Target dictionary): domain / word / term.' },
    },
    {
      name: 'proposalKind',
      type: 'select',
      required: true,
      options: [...PROPOSAL_KIND_OPTIONS],
      admin: { description: '제안구분 (Proposal Kind): register / edit / discard.' },
    },
    {
      name: 'standardSource',
      type: 'select',
      options: [...STANDARD_SOURCE_OPTIONS],
      defaultValue: 'institution',
      admin: { description: '표준출처 (Standard Source).' },
    },
    {
      name: 'revision',
      type: 'text',
      admin: { description: '개정차수 (Revision). e.g. 기관생성.' },
    },
    {
      name: 'proposedName',
      type: 'text',
      required: true,
      admin: {
        description:
          '제안 대상명 (Proposed name) — the domain name / word abbreviation / term abbreviation, denormalized for the work-queue list.',
      },
    },
    {
      name: 'targetEntryId',
      type: 'number',
      admin: {
        description:
          '기존 사전 항목 ID (Existing dictionary entry id) — for edit/discard; empty for register.',
      },
    },
    {
      name: 'proposedPayload',
      type: 'json',
      admin: {
        description:
          '제안 속성 (Proposed attribute set) — the full dictionary field snapshot applied on approval.',
      },
    },
    {
      name: 'proposer',
      type: 'relationship',
      relationTo: 'users',
      admin: { description: '제안자 (Proposer).' },
    },
    {
      name: 'proposedAt',
      type: 'date',
      admin: { description: '제안일시 (Proposal datetime).' },
    },
    {
      name: 'approvalStatus',
      type: 'select',
      required: true,
      options: [...APPROVAL_STATUS_OPTIONS],
      defaultValue: 'pending',
      admin: {
        description:
          '승인상태 (Approval status): 승인대기 → 승인 / 미승인. Setting to 승인 (approved) + saving APPLIES the proposal.',
      },
    },
    {
      name: 'approver',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, description: '승인자 (Approver). Stamped on approval.' },
    },
    {
      name: 'approvedAt',
      type: 'date',
      admin: { readOnly: true, description: '승인일시 (Approval datetime). Stamped on approval.' },
    },
    {
      name: 'processingMemo',
      type: 'textarea',
      admin: { description: '처리 메모 (Processing / rejection memo).' },
    },
    {
      name: 'appliedEntryId',
      type: 'number',
      admin: {
        readOnly: true,
        description:
          '적용된 사전 항목 ID (Applied dictionary entry id) — set once the approval lands; the idempotency guard.',
      },
    },
  ],
  hooks: {
    beforeChange: [applyProposalOnApprove],
    afterChange: [proposalsAudit.afterChange],
    afterDelete: [proposalsAudit.afterDelete],
  },
}
