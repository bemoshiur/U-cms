import type {
  CollectionAfterChangeHook,
  CollectionAfterReadHook,
  CollectionBeforeChangeHook,
} from 'payload'

import { isMemberPrincipal } from '../access/memberAccess'
import { recordPersonalInfoAccess, type SubjectMemberLike } from '../audit/recordPersonalInfoAccess'

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
