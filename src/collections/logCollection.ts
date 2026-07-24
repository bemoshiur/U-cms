import type { Access, CollectionBeforeChangeHook, Field } from 'payload'
import { APIError } from 'payload'

import { menuAccess } from '../access/hasMenuAccess'

/**
 * Shared building blocks for the append-only audit-log collections (Task 2A:
 * accessLogs, loginHistory, permissionChangeLogs, menuPermissionLogs). Every
 * such collection is:
 *
 *  - **create: system-only** — never created through the API/admin by a user;
 *    the audit writers write with `overrideAccess: true`, so `create` denies
 *    everyone (returns `false`).
 *  - **update: forbidden for EVERYONE, including super** — logs are immutable.
 *    `menuAccess`/`isSuper` are deliberately NOT consulted here: `update`
 *    returns an unconditional `false` (this is why it does not reuse
 *    `menuAccessConfig`, which would let a super role through).
 *  - **read/delete: gated on the collection's privacy menuKey** — read for the
 *    audit-viewer role; delete only for retention cleanup by the same role.
 */

const deny: Access = () => false

export function auditLogAccess(menuKey: string): {
  create: Access
  delete: Access
  read: Access
  update: Access
} {
  const gate = menuAccess(menuKey)
  return {
    create: deny,
    read: gate,
    update: deny,
    delete: gate,
  }
}

/**
 * Defense-in-depth immutability: a `beforeChange` hook that hard-rejects any
 * `update`, so even an accidental future `overrideAccess: true` update (which
 * would bypass the `access.update: false` gate above) still cannot mutate a
 * log row. Creates pass through untouched.
 */
export const rejectLogUpdate: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation === 'update') {
    throw new APIError('Audit log records are immutable and cannot be modified.', 403)
  }
  return data
}

/** Marks a field read-only in the admin UI (logs are never hand-edited). */
export function readOnly(field: Field): Field {
  return {
    ...field,
    admin: {
      ...(field.admin ?? {}),
      readOnly: true,
    },
  } as Field
}
