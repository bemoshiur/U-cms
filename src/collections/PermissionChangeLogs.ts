import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { auditLogAccess, readOnly, rejectLogUpdate } from './logCollection'

/**
 * Legacy 권한 변경 이력 (Permission Change History) — feature-inventory ref 3-2.
 * Append-only journal of every change to a user's role assignments, written by
 * the `journalUserRoleChanges` afterChange hook on `users` (diffs the `roles`
 * field before/after). Records the affected user's identity, a before→after
 * change summary, and the actor + IP for non-repudiation.
 *
 * Immutable and gated on `privacy.permissionLogs` — shared with
 * `menuPermissionLogs` (both permission journals live under one Privacy menu
 * node, per the Task 2A brief).
 */
export const PermissionChangeLogs: CollectionConfig = {
  slug: 'permissionChangeLogs',
  admin: {
    group: 'Audit',
    useAsTitle: 'targetUserLabel',
    defaultColumns: ['createdAt', 'targetUserLabel', 'changeSummary', 'actorLabel', 'ipAddress'],
    hidden: ({ user }) => !hasMenuAccessSync(user, 'privacy.permissionLogs'),
  },
  defaultSort: '-createdAt',
  access: auditLogAccess('privacy.permissionLogs'),
  hooks: {
    beforeChange: [rejectLogUpdate],
  },
  fields: [
    readOnly({
      name: 'targetUserLabel',
      type: 'text',
      admin: {
        description: 'The user whose roles changed (legacy 이름).',
      },
    }),
    readOnly({
      name: 'targetUserId',
      type: 'text',
    }),
    readOnly({
      name: 'targetUserEmail',
      type: 'text',
      admin: {
        description: 'The affected user’s email (legacy 이메일주소).',
      },
    }),
    readOnly({
      name: 'changeSummary',
      type: 'text',
      admin: {
        description: 'e.g. "roles: [ROLE_AA] → [ROLE_AA, ROLE_BB]" (legacy 권한변경 요약).',
      },
    }),
    readOnly({
      name: 'actorLabel',
      type: 'text',
      admin: {
        description: 'Who made the change (legacy 변경자).',
      },
    }),
    readOnly({
      name: 'ipAddress',
      type: 'text',
      admin: {
        description: 'The actor’s IP (legacy 변경IP).',
      },
    }),
  ],
}
