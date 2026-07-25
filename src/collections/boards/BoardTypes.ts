import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../../access/hasMenuAccess'
import { auditCollection } from '../../audit/auditCollection'
import {
  BOARD_TYPE_CODE_PAD,
  BOARD_TYPE_CODE_PREFIX,
  BOARD_TYPE_KINDS,
  generateNextSequentialId,
  selectOptions,
} from './defaults'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const boardTypesAudit = auditCollection('content.boardTypes')

/** Max length of the `description` (게시판유형상세) field — ref 1-78's 800-char counter. */
const DESCRIPTION_MAX = 800

/**
 * Assigns the system `code` (`PGxxxx`) on create and enforces the
 * description length cap. Runs in `beforeValidate` (collection) — the same
 * hook phase `codes/Codes.ts` uses to compute a value that later field
 * validation depends on: it fires before "beforeChange - Fields" (where the
 * `code` field's `unique` validation queries the DB), so the generated value
 * is already present and gets a friendly "already exists" error in the
 * common case, with the DB unique index as the race backstop (see
 * `generateNextSequentialId`).
 *
 * `code` is only generated when absent, so the seed can pin the legacy codes
 * (PG0001…PG0010) explicitly while admin-created types auto-increment from
 * the current max.
 */
const assignCodeAndValidate: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (!data) {
    return data
  }

  if (typeof data.description === 'string' && data.description.length > DESCRIPTION_MAX) {
    throw new APIError(
      `Board type detail must be ${DESCRIPTION_MAX} characters or fewer (received ${data.description.length}).`,
      400,
    )
  }

  if (
    operation === 'create' &&
    (data.code === undefined || data.code === null || data.code === '')
  ) {
    data.code = await generateNextSequentialId(
      req.payload,
      'boardTypes',
      'code',
      BOARD_TYPE_CODE_PREFIX,
      BOARD_TYPE_CODE_PAD,
      req,
    )
  }

  return data
}

/**
 * Legacy 게시판 유형 관리 (Board Type Management — refs 1-77/1-78). Global (NOT
 * tenant-scoped): board types are shared definitions that any site's boards
 * may reference. Each type carries a system-assigned `PGxxxx` code and a
 * `kind` that drives post rendering/behavior in Task 3B.
 *
 * Skin/JSP note (deferred): legacy coupled each PG code to a server-side
 * Service class + a JSP template folder (`/WEB-INF/jsp/.../{PGcode}/*.jsp`).
 * The rebuild renders via React in Phase 4, so no JSP path is stored — the
 * `kind` field is the behavioral discriminator instead. See task-3A-report.md.
 */
export const BoardTypes: CollectionConfig = {
  slug: 'boardTypes',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['code', 'name', 'kind', 'tableName'],
    hidden: ({ user }) => !hasMenuAccessSync(user, 'content.boardTypes'),
  },
  access: menuAccessConfig('content.boardTypes'),
  fields: [
    {
      name: 'code',
      type: 'text',
      unique: true,
      // System-generated, never client-set: field-level write access denies
      // every create/update so a crafted API call can't supply a non-PGxxxx
      // value or rewrite an existing code. The beforeValidate hook sets it via
      // the normal data path (collection hooks run after field-access has
      // stripped any client-supplied `code`); seeds pass it through with
      // overrideAccess, which bypasses field access.
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description:
          'System-assigned board type code (PGxxxx), auto-generated on create — not user-editable.',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: selectOptions(BOARD_TYPE_KINDS),
      admin: {
        description:
          'Behavioral kind — drives post rendering/behavior in Task 3B (integrated/photo/qna/faq/attachment/extended).',
      },
    },
    {
      name: 'tableName',
      type: 'text',
      defaultValue: 'posts',
      admin: {
        description:
          'Informational: legacy stored every board type in one physical table (tb_bbs). The rebuild likewise stores every board type in the single `posts` collection — this field is retained for legacy/audit parity and is not a live table switch.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: `Board type detail (게시판유형상세). Max ${DESCRIPTION_MAX} characters.`,
      },
    },
  ],
  hooks: {
    beforeValidate: [assignCodeAndValidate],
    afterChange: [boardTypesAudit.afterChange],
    afterDelete: [boardTypesAudit.afterDelete],
  },
}
