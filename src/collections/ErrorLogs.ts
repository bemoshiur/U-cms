import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { ERROR_LOGS_MENU_KEY, errorStatsExportEndpoints } from '../endpoints/errorStatsExport'
import { auditLogAccess, readOnly, rejectLogUpdate } from './logCollection'

/** Permanent menu-grant key gating this collection + the stats view + export. */
export { ERROR_LOGS_MENU_KEY }

/**
 * System-wide error log (legacy 오류 로그 / 오류 이력) — feature-inventory refs
 * 1-56..1-59. An APPEND-ONLY, IMMUTABLE record of every captured unhandled
 * exception: the exception class, a SANITIZED message + truncated stack digest,
 * the request URL / method / HTTP status, the acting admin (denormalized, NOT an
 * FK — see below), the client IP, a coarse user-agent family, and when it
 * occurred. Written exclusively by the global capture path (`recordError`, wired
 * into the config-level `afterError` hook) via `overrideAccess`.
 *
 * ## GLOBAL (not tenant-scoped)
 *
 * Legacy 오류 로그 is a system-level admin store, not a per-site one — an
 * unhandled exception isn't inherently tied to one tenant (it can occur in
 * global admin flows, cron, boot, etc.). So this collection carries NO tenant
 * field and is gated purely on `system.errorLogs`, mirroring the global audit
 * collections (accessLogs/loginHistory).
 *
 * ## Immutability (mirrors the audit backbone)
 *
 * Reuses the shared `logCollection` primitives: `create` denies everyone (only
 * the system writer with `overrideAccess` writes), `update` is forbidden for
 * EVERYONE including super (both via `access.update: false` AND the
 * defense-in-depth `rejectLogUpdate` `beforeChange` guard), and `read`/`delete`
 * are gated on `system.errorLogs` (delete = retention cleanup by the same grant
 * holder). See `src/collections/logCollection.ts`.
 *
 * ## Why `actorLabel` (text), NOT a `users` FK — the deadlock lesson (T2A)
 *
 * The identity of the acting admin is stored as the denormalized `actorLabel`
 * (`name(id)`) + a text `actorId`, NEVER a `relationship → users`. This is the
 * same lesson `recordAccess`/`accessLogs` learned for auth events, but it is
 * even MORE fundamental for error capture: `recordError` can fire during ANY
 * operation — including a login or a self-edit that holds a `FOR UPDATE` lock on
 * the actor's OWN user row — and it writes in its OWN isolated transaction. A
 * `users` FK would run a `FOR KEY SHARE` check on that same locked row, blocking
 * on a lock the original (JS-awaiting) operation still holds — a cross-transaction
 * deadlock Postgres cannot detect. A text label also survives deletion of the
 * user and needs no populate. So: text only, no FK.
 *
 * ## No secrets / PII in the stored message or stack
 *
 * The message + stack are SANITIZED before storage (`src/audit/sanitizeError.ts`):
 * passwords/tokens/JWTs/API keys/emails/opaque secret blobs are redacted, and the
 * stack is truncated to the top frames. This store is admin-readable AND
 * CSV-exportable, so it must never persist a live credential or personal datum.
 */
export const ErrorLogs: CollectionConfig = {
  slug: 'errorLogs',
  admin: {
    group: 'Audit',
    useAsTitle: 'exceptionClass',
    defaultColumns: [
      'occurredAt',
      'exceptionClass',
      'statusCode',
      'url',
      'actorLabel',
      'ipAddress',
    ],
    hidden: ({ user }) => !hasMenuAccessSync(user, ERROR_LOGS_MENU_KEY),
  },
  // Newest first (ref 1-57 list is most-recent-first).
  defaultSort: '-occurredAt',
  access: auditLogAccess(ERROR_LOGS_MENU_KEY),
  hooks: {
    // Append-only: reject updates even under overrideAccess (defense in depth).
    beforeChange: [rejectLogUpdate],
  },
  endpoints: errorStatsExportEndpoints,
  fields: [
    readOnly({
      name: 'occurredAt',
      type: 'date',
      required: true,
      index: true,
      defaultValue: () => new Date().toISOString(),
      admin: { description: 'When the exception occurred (the period-tab axis).' },
    }),
    readOnly({
      name: 'exceptionClass',
      type: 'text',
      index: true,
      admin: { description: 'The exception class name (the by-type stat tab).' },
    }),
    readOnly({
      name: 'message',
      type: 'textarea',
      admin: { description: 'SANITIZED error message (secrets/PII redacted before storage).' },
    }),
    readOnly({
      name: 'url',
      type: 'text',
      index: true,
      admin: {
        description: 'The request URL/path where the error occurred (the by-URL stat tab).',
      },
    }),
    readOnly({
      name: 'httpMethod',
      type: 'text',
      admin: { description: 'The HTTP method of the failing request, if known.' },
    }),
    readOnly({
      name: 'statusCode',
      type: 'number',
      index: true,
      admin: { description: 'The HTTP status returned (>= 500 = captured unhandled exception).' },
    }),
    readOnly({
      name: 'actorLabel',
      type: 'text',
      admin: {
        description:
          'Denormalized "name(id)" of the acting admin (null for anonymous). Masked in the list.',
        // Display-only PII masking in the list view (real value stored).
        components: {
          Cell: '/components/audit/MaskedCell#MaskedCell',
        },
      },
    }),
    readOnly({
      name: 'actorId',
      type: 'text',
      admin: { description: 'The acting admin id as text (NOT an FK — see the deadlock note).' },
    }),
    readOnly({
      name: 'ipAddress',
      type: 'text',
      admin: { description: 'Raw client IP (IPv4/IPv6), captured as-is from the trusted request.' },
    }),
    readOnly({
      name: 'stackDigest',
      type: 'textarea',
      admin: {
        description: 'Truncated + SANITIZED stack (top frames only; no full internals/secrets).',
      },
    }),
    readOnly({
      name: 'userAgentFamily',
      type: 'text',
      admin: { description: 'Coarse OS/browser family (no version — never fingerprints).' },
    }),
  ],
}
