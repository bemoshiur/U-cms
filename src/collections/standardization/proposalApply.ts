import type { CollectionBeforeChangeHook } from 'payload'
import { APIError } from 'payload'

import {
  PROPOSAL_TARGET_COLLECTION,
  STANDARDIZATION_BYPASS_LOCK,
} from '../../standardization/constants'

/**
 * Apply-on-approve engine for the DBA proposal workflow (Phase 8, Task 8.1b;
 * refs 1-68..1-73). A `standardizationProposals` row is a pending change against
 * one of the three enacted-standard-locked dictionaries. The ONLY sanctioned way
 * to write an enacted standard is to APPROVE its proposal — this hook is that
 * gate: when a proposal transitions to `approvalStatus: 'approved'`, it applies
 * the proposed change to the target dictionary via the `standardizationBypassLock`
 * seam (the escape hatch the 8.1a lock left for exactly this).
 *
 * ## Transactional
 * The nested `payload.create/update` calls pass the request (`req`), so they run
 * INSIDE the proposal-update's transaction: if applying fails (e.g. the target
 * row is gone), the whole approval rolls back — the proposal never records
 * `approved` without its change landing.
 *
 * ## Idempotent (no double-apply)
 * The hook only fires on the pending→approved TRANSITION
 * (`originalDoc.approvalStatus !== 'approved'`) and additionally refuses to act
 * if `appliedEntryId` is already set. Re-saving an already-approved proposal (a
 * double-approve) is therefore a no-op — the dictionary is written exactly once.
 *
 * ## Logged
 * The collection's `auditCollection` afterChange hook records the proposal
 * mutation (the approve is an `update`), and the dictionary write it triggers
 * fires that dictionary's OWN audit hook — so the enacted-standard change is
 * double-recorded in the access-log backbone (audit / 감리 requirement).
 *
 * ## Bypass scoped to the apply; system controls `enacted`
 * The enacted-lock bypass is set on `req.context` only for the duration of the
 * apply and restored in a `finally` (never leaked past this operation — see the
 * inline note), and `enacted` is stripped from the proposed payload so an
 * approved proposal can never flip the super-only `enacted` marker via its
 * payload; the SYSTEM controls it.
 */

type ProposalData = {
  target?: string
  proposalKind?: string
  targetEntryId?: number | null
  proposedPayload?: Record<string, unknown> | null
  proposedName?: string | null
  standardSource?: string | null
  approvalStatus?: string
  approver?: unknown
  approvedAt?: unknown
  appliedEntryId?: number | null
}

export const applyProposalOnApprove: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const next = data as ProposalData
  const prev = (originalDoc ?? {}) as ProposalData

  const becomingApproved = next.approvalStatus === 'approved' && prev.approvalStatus !== 'approved'
  if (!becomingApproved) {
    return data
  }
  // Defensive idempotency guard: never apply twice.
  if (prev.appliedEntryId != null) {
    return data
  }

  const target = next.target ?? prev.target
  const proposalKind = next.proposalKind ?? prev.proposalKind
  const targetEntryId = next.targetEntryId ?? prev.targetEntryId ?? null
  const proposedPayload = (next.proposedPayload ?? prev.proposedPayload ?? {}) as Record<
    string,
    unknown
  >
  const source = next.standardSource ?? prev.standardSource ?? 'institution'

  const collectionSlug = target ? PROPOSAL_TARGET_COLLECTION[target] : undefined
  if (!collectionSlug) {
    throw new APIError(`Unknown proposal target "${String(target)}".`, 400)
  }

  // Stamp the approver + approval datetime onto the proposal itself.
  if (next.approver == null && req.user?.id != null) {
    next.approver = req.user.id
  }
  if (next.approvedAt == null) {
    next.approvedAt = new Date().toISOString()
  }

  // The SYSTEM — never the proposal payload — controls `enacted` (it is a
  // super-only field). The apply writes with `overrideAccess: true` (which also
  // bypasses field-level access), so a payload carrying `enacted: true` would
  // otherwise persist an enacted row. Strip it: an approved proposal can never
  // flip `enacted` via its payload; approved registrations stay institution
  // (`enacted` defaults false), and edits leave the target's `enacted` untouched.
  const { enacted: _ignoredEnacted, ...safePayload } = proposedPayload

  // Set the enacted-lock bypass on the request context ONLY for the duration of
  // the apply. Passing `context: { bypass: true }` alongside `req` would leave
  // the flag set for the rest of the request (`createLocalReq` merges it into the
  // req and never restores it) — a foot-gun for any later hook. Instead we set it
  // explicitly and clear it in `finally` (robust to a throwing apply), so the
  // bypass is scoped to exactly this one apply operation. NOTE: a nested
  // `payload.create/update` re-derives `req.context` (a fresh clone that inherits
  // this flag, which is how the nested op's lock hook sees it), so the `finally`
  // must read `req.context` LIVE — a reference captured before the write would be
  // stale and the flag would leak on the current context object.
  const hadBypass = STANDARDIZATION_BYPASS_LOCK in (req.context as Record<string, unknown>)
  const priorBypass = (req.context as Record<string, unknown>)[STANDARDIZATION_BYPASS_LOCK]
  ;(req.context as Record<string, unknown>)[STANDARDIZATION_BYPASS_LOCK] = true

  let appliedId: number | undefined
  try {
    if (proposalKind === 'register') {
      // A DBA-approved registration always lands as an approved, institution
      // (non-enacted) entry — `enacted` is stripped above and defaults false.
      const created = await req.payload.create({
        collection: collectionSlug,
        data: {
          ...safePayload,
          standardSource: source,
          approvalStatus: 'approved',
          approvedAt: next.approvedAt as string,
        } as never,
        overrideAccess: true,
        req,
      })
      appliedId = created.id as number
    } else if (proposalKind === 'edit') {
      if (targetEntryId == null) {
        throw new APIError('Edit proposal has no target dictionary entry.', 400)
      }
      const updated = await req.payload.update({
        collection: collectionSlug,
        id: targetEntryId,
        data: { ...safePayload } as never,
        overrideAccess: true,
        req,
      })
      appliedId = updated.id as number
    } else if (proposalKind === 'discard') {
      if (targetEntryId == null) {
        throw new APIError('Discard proposal has no target dictionary entry.', 400)
      }
      // Discard = soft-remove: flip the entry to unused (ref 1-68 폐기).
      const updated = await req.payload.update({
        collection: collectionSlug,
        id: targetEntryId,
        data: { useStatus: 'unused' } as never,
        overrideAccess: true,
        req,
      })
      appliedId = updated.id as number
    } else {
      throw new APIError(`Unknown proposal kind "${String(proposalKind)}".`, 400)
    }
  } finally {
    // Re-close the bypass so it never leaks past this single apply. Read the
    // LIVE `req.context` (the nested write may have swapped it for a clone).
    const cur = req.context as Record<string, unknown>
    if (hadBypass) {
      cur[STANDARDIZATION_BYPASS_LOCK] = priorBypass
    } else {
      delete cur[STANDARDIZATION_BYPASS_LOCK]
    }
  }

  next.appliedEntryId = appliedId ?? null
  return data
}
