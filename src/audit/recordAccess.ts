import type { Payload, PayloadRequest } from 'payload'

import { toRelationId } from '../collections/utils'
import { resolveActorLabel, resolveIpAddress, resolveSessionLoginAt } from './helpers'

/**
 * The seven audit action verbs (feature-inventory ref 1-55 / 3-1 observed
 * 행동 values: 로그인/메인조회/등록처리/수정처리/삭제처리, plus logout and
 * list). Mutations are captured automatically by `auditCollection`; login/
 * logout by the auth hooks. `list`/`view` are reserved for a later read-audit
 * pass (deferred — see task-2A-report.md).
 */
export type AuditAction = 'login' | 'logout' | 'list' | 'view' | 'create' | 'update' | 'delete'

export type RecordAccessArgs = {
  action: AuditAction
  /** Explicit actor; defaults to `req.user`. Pass for login (user isn't on `req.user` yet at every point). */
  actor?: unknown
  /**
   * Whether to set the `actor` relationship FK (default `true`). Set `false`
   * for auth events (login/logout): the auth operation holds a `FOR UPDATE`
   * lock on the actor's OWN user row, and this write runs in a separate,
   * isolated transaction — its FK `FOR KEY SHARE` check on that same row would
   * block on the auth lock while the auth operation is (via a JS `await`)
   * waiting on this write to finish, i.e. a cross-transaction deadlock that
   * Postgres cannot detect (one side is a JS await, not a DB lock wait). The
   * denormalized `actorLabel` still records the identity, so no information is
   * lost. Regular collection mutations lock the mutated row (not a user row),
   * so their `actor` FK is safe and kept.
   */
  linkActor?: boolean
  /** The adminMenu menuKey touched, if any (mutations pass their collection's gate key). */
  menuKey?: string
  /** Human-readable menu label (breadcrumb) — defaults to the collection slug at the call site. */
  menuLabel?: string
  req: PayloadRequest
  /** The session login timestamp; defaults to the actor's `lastLoginAt`. */
  sessionLoginAt?: string
  /** The request URL/path; defaults to `req.pathname`. */
  url?: string
}

/**
 * Writes one `accessLogs` row (Task 2A Part 1/2; refs 1-55, 3-1).
 *
 * ## Contract: auditing must NEVER break the audited action
 *
 * Two independent guarantees, both required:
 *
 *  1. **try/catch** — any failure (validation, DB, resolver) is logged and
 *     swallowed; this function never throws into its caller.
 *  2. **Transaction isolation** — the write deliberately does NOT pass the
 *     caller's `req` to `payload.create`, so it runs in its own transaction on
 *     a separate connection. This is the load-bearing half: an `afterChange`
 *     hook runs *before* the audited operation's transaction commits, so if
 *     the audit INSERT shared that transaction and failed, Postgres would mark
 *     the whole transaction aborted and the audited action's own COMMIT would
 *     then fail — i.e. a bad audit write would break the very action it audits.
 *     try/catch alone can't prevent that (the abort surfaces at COMMIT, outside
 *     this function). Running the audit write in its own transaction is what
 *     actually isolates the failure. The trade-off — an audit row can persist
 *     for an action whose own transaction later rolls back (over-logging) — is
 *     the correct direction for an audit trail: never lose the action, tolerate
 *     an occasional orphan log. `accessLogs` shares no rows with the audited
 *     collections, so there is no lock/deadlock interaction.
 */
export async function recordAccess(payload: Payload, args: RecordAccessArgs): Promise<void> {
  try {
    const actor = args.actor ?? args.req?.user ?? undefined
    const rawActorId = args.linkActor === false || !actor ? undefined : toRelationId(actor)
    // Postgres ids are integers in this project (no UUID adapter — see
    // payload.config.ts), so the `accessLogs.actor` relationship expects a
    // number. Coerce a numeric-string id; drop anything non-numeric.
    const actorId =
      typeof rawActorId === 'number'
        ? rawActorId
        : typeof rawActorId === 'string' && rawActorId !== '' && !Number.isNaN(Number(rawActorId))
          ? Number(rawActorId)
          : undefined

    await payload.create({
      collection: 'accessLogs',
      data: {
        action: args.action,
        actor: actorId,
        actorLabel: resolveActorLabel(actor),
        menuKey: args.menuKey,
        menuLabel: args.menuLabel,
        url: args.url ?? args.req?.pathname ?? '(local-api)',
        ipAddress: resolveIpAddress(args.req),
        sessionLoginAt: args.sessionLoginAt ?? resolveSessionLoginAt(args.req),
      },
      overrideAccess: true,
    })
  } catch (err) {
    payload?.logger?.error?.(
      { err },
      '[audit] recordAccess failed — swallowed to protect the audited action',
    )
  }
}
