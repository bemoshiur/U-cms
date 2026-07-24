import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { recordAccess } from './recordAccess'

/**
 * Reusable audit-hook factory (Task 2A Part 2). Given the `menuKey` that gates
 * a collection, returns `afterChange` + `afterDelete` hooks that write an
 * `accessLogs` row for every **mutation**:
 *
 *  - `afterChange`  → `create` or `update` (Payload passes `operation`)
 *  - `afterDelete`  → `delete`
 *
 * Wired onto every Phase 1 collection (sites, roles, adminMenus, departments,
 * codeClassifications, codeGroups, codes, users, passwordPolicies).
 *
 * ## Scope: mutations only (read/list auditing deferred)
 *
 * Legacy ref 1-55 also logs 조회 (view/list), but an `afterRead`/list audit
 * fires on *every* row of *every* list render — far too noisy to enable
 * blanket. It is deferred to a later, targeted pass (e.g. only the
 * personal-info screens of ref 3-8, which genuinely require read logging). See
 * task-2A-report.md.
 *
 * ## `context.skipAudit`
 *
 * A caller can set `req.context.skipAudit = true` around a system mutation to
 * suppress its audit row — used by the login flow so the internal
 * `lastLoginAt` stamp isn't double-logged alongside the dedicated `login`
 * event (see `recordLastLogin`).
 *
 * ## `linkActor` (the `users` collection)
 *
 * The one FK in an audit row is `accessLogs.actor → users`. A mutation on the
 * `users` collection locks the mutated user row in a way that conflicts with
 * the isolated audit write's FK `FOR KEY SHARE` check on that same row when the
 * actor IS the mutated user (self-edit) — a cross-transaction deadlock (see the
 * full explanation on `RecordAccessArgs.linkActor`). So the `users` collection
 * passes `linkActor: false` (identity preserved via `actorLabel`); every other
 * collection mutates a non-user row, so its `actor` FK is safe and kept.
 */
export function auditCollection(
  menuKey: string,
  options?: { linkActor?: boolean; menuLabel?: string },
): {
  afterChange: CollectionAfterChangeHook
  afterDelete: CollectionAfterDeleteHook
} {
  const { linkActor, menuLabel } = options ?? {}

  const afterChange: CollectionAfterChangeHook = async ({
    collection,
    context,
    doc,
    operation,
    req,
  }) => {
    if (!context?.skipAudit) {
      await recordAccess(req.payload, {
        req,
        action: operation,
        linkActor,
        menuKey,
        menuLabel: menuLabel ?? collection?.slug,
        url: req?.pathname,
      })
    }
    return doc
  }

  const afterDelete: CollectionAfterDeleteHook = async ({ collection, context, doc, req }) => {
    if (!context?.skipAudit) {
      await recordAccess(req.payload, {
        req,
        action: 'delete',
        linkActor,
        menuKey,
        menuLabel: menuLabel ?? collection?.slug,
        url: req?.pathname,
      })
    }
    return doc
  }

  return { afterChange, afterDelete }
}
