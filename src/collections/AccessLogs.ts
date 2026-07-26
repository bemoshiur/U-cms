import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { accessHistoryEndpoints } from '../endpoints/accessHistoryExport'
import { auditLogAccess, readOnly, rejectLogUpdate } from './logCollection'

/**
 * Legacy 접속이력 / 관리자 접속 이력 (Access History) — feature-inventory refs
 * 1-55 and 3-1. Append-only audit log of every admin action: who
 * (`actor`/`actorLabel`), which menu (`menuKey`/`menuLabel`), what
 * (`action`), the request `url`, `ipAddress`, the event time (`createdAt`),
 * and the session's login time (`sessionLoginAt`) for session reconstruction.
 *
 * Written exclusively by the audit backbone (`recordAccess` /
 * `auditCollection` / the auth hooks) via `overrideAccess`; immutable and
 * gated on the `privacy.accessLogs` menuKey (see `logCollection.ts`).
 *
 * `actor` is optional (null for anonymous/system events); `actorLabel` is the
 * denormalized `name(id)` snapshot so a row survives deletion of the user.
 */
export const AccessLogs: CollectionConfig = {
  slug: 'accessLogs',
  admin: {
    group: 'Privacy Protection System',
    useAsTitle: 'actorLabel',
    defaultColumns: ['createdAt', 'actorLabel', 'action', 'menuKey', 'ipAddress'],
    hidden: ({ user }) => !hasMenuAccessSync(user, 'privacy.accessLogs'),
  },
  // Newest first in the list view (ref 1-55 shows most-recent-first ordering).
  defaultSort: '-createdAt',
  access: auditLogAccess('privacy.accessLogs'),
  // Task 5C: the site access-history view + CSV export (ref 2-20) — a masked,
  // date+keyword-searchable, paginated VIEW over these logs. Gated on the same
  // `privacy.accessLogs` grant; see src/endpoints/accessHistoryExport.ts.
  endpoints: accessHistoryEndpoints,
  hooks: {
    // Append-only: reject updates even under overrideAccess (defense in depth
    // beyond `access.update: false`).
    beforeChange: [rejectLogUpdate],
  },
  fields: [
    readOnly({
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: {
        description: 'The acting admin (null for anonymous/system events).',
      },
    }),
    readOnly({
      name: 'actorLabel',
      type: 'text',
      admin: {
        description: 'Denormalized "name(id)" snapshot — survives deletion of the user.',
        // Display-only PII masking in the list view (real value stored).
        components: {
          Cell: '/components/audit/MaskedCell#MaskedCell',
        },
      },
    }),
    readOnly({
      name: 'menuKey',
      type: 'text',
      admin: {
        description: 'The adminMenu menuKey touched, if any.',
      },
    }),
    readOnly({
      name: 'menuLabel',
      type: 'text',
    }),
    readOnly({
      name: 'action',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Login', value: 'login' },
        { label: 'Logout', value: 'logout' },
        { label: 'List', value: 'list' },
        { label: 'View', value: 'view' },
        { label: 'Create', value: 'create' },
        { label: 'Update', value: 'update' },
        { label: 'Delete', value: 'delete' },
        // Task 2C: an admin request refused by the IP access control.
        { label: 'Denied (IP)', value: 'denied' },
      ],
    }),
    readOnly({
      name: 'url',
      type: 'text',
      required: true,
    }),
    readOnly({
      name: 'ipAddress',
      type: 'text',
      admin: {
        description: 'Raw client IP (IPv4/IPv6), captured as-is.',
      },
    }),
    readOnly({
      name: 'sessionLoginAt',
      type: 'date',
      admin: {
        description: "The session's login timestamp, for session reconstruction.",
      },
    }),
  ],
}
