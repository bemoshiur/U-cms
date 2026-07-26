import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { auditLogAccess, readOnly, rejectLogUpdate } from './logCollection'

/**
 * Legacy 메뉴 권한 설정 이력 (Menu Permission Setting History) —
 * feature-inventory ref 3-3. Append-only journal of every change to a role's
 * menu grants, written by the `journalRoleMenuChanges` afterChange hook on
 * `roles` (diffs the `menuGrants` field before/after). Each event enumerates
 * every added / removed menu (by display label) and snapshots the role's
 * members at change time so the blast radius is traceable.
 *
 * Immutable and gated on `privacy.permissionLogs` (shared with
 * `permissionChangeLogs` — one Privacy menu node covers both permission
 * journals, per the Task 2A brief).
 */
export const MenuPermissionLogs: CollectionConfig = {
  slug: 'menuPermissionLogs',
  admin: {
    group: 'Privacy Protection System',
    useAsTitle: 'roleLabel',
    defaultColumns: ['createdAt', 'roleId', 'roleLabel', 'actorLabel', 'ipAddress'],
    hidden: ({ user }) => !hasMenuAccessSync(user, 'privacy.permissionLogs'),
  },
  defaultSort: '-createdAt',
  access: auditLogAccess('privacy.permissionLogs'),
  hooks: {
    beforeChange: [rejectLogUpdate],
  },
  fields: [
    readOnly({
      name: 'roleLabel',
      type: 'text',
      admin: {
        description: 'The role whose menu grants changed (legacy 권한명).',
      },
    }),
    readOnly({
      name: 'roleId',
      type: 'text',
      admin: {
        description: 'The role code (legacy 권한코드), e.g. "ROLE_CC".',
      },
    }),
    readOnly({
      name: 'addedMenus',
      type: 'json',
      admin: {
        description: 'Menu labels granted in this event (legacy 메뉴 권한 등록).',
      },
    }),
    readOnly({
      name: 'removedMenus',
      type: 'json',
      admin: {
        description: 'Menu labels revoked in this event (legacy 메뉴 권한 제거).',
      },
    }),
    readOnly({
      name: 'roleMemberSnapshot',
      type: 'json',
      admin: {
        description:
          'Actor-label snapshot of users in the role at change time (legacy 소속 사용자).',
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
