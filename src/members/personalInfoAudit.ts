import type {
  CollectionAfterChangeHook,
  CollectionAfterReadHook,
  CollectionBeforeChangeHook,
} from 'payload'

import { isMemberPrincipal } from '../access/memberAccess'
import { recordPersonalInfoAccess, type SubjectMemberLike } from '../audit/recordPersonalInfoAccess'
import { maskEmail, maskId, maskName } from '../lib/mask'

/**
 * Context flag (set only by trusted server code — e.g. the purpose-gated member
 * export) that suppresses the list/populate PII masking below. An HTTP caller
 * cannot set `req.context`, so this can never be used to widen disclosure from
 * the outside; the export sets it, then applies its OWN tiered masking to the
 * CSV (masked for a members.manage admin, full only for a privacy officer).
 */
export const SKIP_MEMBER_PII_MASK = 'skipMemberPiiMask' as const

/**
 * Non-bypassable personal-info VIEW/EDIT capture for the `members` collection
 * (Task 6A Part 2; refs 3-8, 1-36). Wired as server-side collection hooks so
 * that EVERY read/edit of a member's PII is logged to `personalInfoAccessLogs`
 * — NOT only clicks in the admin UI. A raw `GET /api/members/:id` by an admin,
 * or a privacy-officer local-API read, is logged the same way: this is the
 * whole security point (the legacy browser-confirm gate is a UI affordance that
 * a scripted API caller would simply skip, so the authoritative capture lives
 * on the server, not the client).
 *
 * ## Why `afterRead` with a `findMany` guard, not a blanket read-audit
 *
 * Auditing every `afterRead` row of every LIST render is far too noisy (the
 * `auditCollection` doc comment explains why blanket read-auditing was
 * deferred). But the personal-info DETAIL view is a SINGLE-document read
 * (`findByID` → `findMany` falsey), so gating on `!findMany` captures exactly
 * the "opened one member's PII" event — the admin edit/detail view AND a raw
 * by-id API read — while a list render (`findMany: true`) logs nothing.
 *
 * ## What is deliberately NOT logged (to keep the trail meaningful)
 *
 *  - `findMany` list renders — noise (see above).
 *  - Reads with NO `req.user` — system/seed/local-API internal reads (sign-up
 *    lookups, login, the export's own bulk read) have no admin actor to
 *    attribute and are not a person viewing PII.
 *  - Reads by a MEMBER principal (`isMemberPrincipal`) — a member viewing/editing
 *    their OWN profile on the public site is self-service, not an admin PII touch.
 *  - Anything under `context.skipPersonalInfoAudit` — an escape hatch for
 *    internal admin flows that must not be attributed as a manual PII access.
 *
 * Over-logging (e.g. the admin edit view fetching the doc twice) is tolerated —
 * the correct direction for an audit trail is never to MISS an access, per the
 * `recordAccess` contract. `recordPersonalInfoAccess` never throws into these
 * hooks and writes in its own transaction, so it can never break a member read.
 */

/** True when this read/change should NOT produce a personal-info audit row. */
function shouldSkip(req: unknown): boolean {
  const r = req as { user?: unknown; context?: { skipPersonalInfoAudit?: unknown } } | undefined
  if (!r?.user) {
    return true
  }
  if (isMemberPrincipal(r.user)) {
    return true
  }
  if (r.context?.skipPersonalInfoAudit) {
    return true
  }
  return false
}

/**
 * Marks the current request as an in-flight WRITE so the `afterRead` view-capture
 * can distinguish a genuine read from the `afterRead` that Payload runs at the
 * TAIL of a create/update (to shape the returned doc). Without this, every admin
 * create/edit would spuriously log a `view` (and an update would DOUBLE-log a
 * `view` alongside its `edit`). `beforeChange` runs before that tail `afterRead`
 * within the same operation `req`, so setting the flag here reliably suppresses
 * it; a pure `find`/`findByID` has no `beforeChange`, so the flag stays unset and
 * the read is logged. The flag is operation-`req`-scoped, so it never leaks into a
 * later read.
 */
export const markPersonalInfoWrite: CollectionBeforeChangeHook = ({ context, data }) => {
  ;(context as { skipPersonalInfoView?: boolean }).skipPersonalInfoView = true
  return data
}

/** Logs a `view` on every single-document (detail) read of a member's PII by an admin. */
export const capturePersonalInfoView: CollectionAfterReadHook = async ({
  context,
  doc,
  findMany,
  req,
}) => {
  // Only single-doc detail reads (not list renders, not the read-tail of a
  // create/update) count as "viewing PII".
  if (findMany || (context as { skipPersonalInfoView?: boolean })?.skipPersonalInfoView) {
    return doc
  }
  if (shouldSkip(req)) {
    return doc
  }
  await recordPersonalInfoAccess(req.payload, {
    req,
    viewer: req.user,
    subjectMember: doc as SubjectMemberLike,
    screen: 'member-detail',
    url: req.pathname,
    action: 'view',
    purposeCategory: 'view',
  })
  return doc
}

/** Logs an `edit` whenever an admin updates a member's PII. */
export const capturePersonalInfoEdit: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  // Only edits of an existing member; admin-created members and self-service
  // sign-up (overrideAccess, no admin user) are not a PII "view/edit" event.
  if (operation !== 'update' || shouldSkip(req)) {
    return doc
  }
  await recordPersonalInfoAccess(req.payload, {
    req,
    viewer: req.user,
    subjectMember: doc as SubjectMemberLike,
    screen: 'member-detail',
    url: req.pathname,
    action: 'edit',
    purposeCategory: 'edit',
  })
  return doc
}

/** The member PII fields masked in list/populate contexts, and how each is masked. */
const MEMBER_PII_MASKERS: { field: string; mask: (v: string) => string }[] = [
  { field: 'name', mask: maskName },
  { field: 'loginId', mask: maskId },
  { field: 'email', mask: maskEmail },
  { field: 'mobile', mask: maskId },
]

/**
 * PII-minimization for member reads that are NOT the confirm-gated, AUDITED
 * detail view (Task 6A C1/H1 hardening). The legacy model masks member PII
 * EVERYWHERE except the single audited detail read; full plaintext must never be
 * disclosed on a path that produces no `personalInfoAccessLogs` row.
 *
 * The `capturePersonalInfoView` hook logs a `view` precisely on a SINGLE-document
 * read (`!findMany`). This hook is its exact complement: it MASKS
 * name/loginId/email/mobile on every MULTI-document read (`findMany: true`) —
 * which is BOTH the admin LIST view AND relationship-population from another
 * collection (the dataloader batches populated relations as `findMany: true`, so
 * e.g. a `surveyResponses.respondent` / `satisfactionRatings.member` populate, or
 * any `?depth=1` REST/GraphQL read, is masked, not disclosed). Result: the two
 * hooks PARTITION every member read on the same `findMany` flag, so full PII is
 * returned ONLY on the audited `!findMany` path — there is no code path that
 * discloses full PII without a log.
 *
 * Exemptions (all still safe under the invariant):
 *  - `overrideAccess: true` — a TRUSTED server/system read (login loginId→email
 *    resolution, account recovery, sign-up dup-checks). These never surface a
 *    member's PII to an admin as a disclosure; they are infrastructure.
 *  - `SKIP_MEMBER_PII_MASK` context flag — the purpose-gated export (which is
 *    itself logged and applies its own role-tiered masking).
 *  - a MEMBER principal — a member reading their OWN record (self-service); a
 *    member can never read another member (collection access), so this only ever
 *    returns the member their own data.
 */
export const maskMemberPiiForList: CollectionAfterReadHook = ({
  context,
  doc,
  findMany,
  overrideAccess,
  req,
}) => {
  if (!findMany || overrideAccess) {
    return doc
  }
  if ((context as Record<string, unknown> | undefined)?.[SKIP_MEMBER_PII_MASK]) {
    return doc
  }
  if (isMemberPrincipal((req as { user?: unknown } | undefined)?.user)) {
    return doc
  }
  const d = doc as Record<string, unknown>
  for (const { field, mask } of MEMBER_PII_MASKERS) {
    const value = d[field]
    if (typeof value === 'string' && value.length > 0) {
      d[field] = mask(value)
    }
  }
  return doc
}
