import type {
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
  TextFieldSingleValidation,
} from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync, isSuperUser, menuFieldAccess } from '../../access/hasMenuAccess'
import { SECURITY_DOCS_MENU_KEY, securityDocScopedAccess } from '../../access/securityDocs'
import { getAssignedTenantIds } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { boardExportEndpoint } from '../../endpoints/boardExport'
import { toRelationId } from '../utils'
import {
  BBS_ID_PAD,
  BBS_ID_PREFIX,
  BOARD_DEFAULT_FIELDS,
  DEFAULT_DETAIL_FIELD_ORDER,
  DEFAULT_LIST_FIELD_ORDER,
  FIELD_INPUT_TYPES,
  generateNextSequentialId,
  INTEGRATED_BOARD_TYPE_CODE,
  selectOptions,
} from './defaults'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const boardsAudit = auditCollection('content.boards')

/**
 * The five behavioral flags shared by every category binding (ref 1-29) and
 * every field-grid row (ref 1-30): 사용/필수/목록/보기/검색.
 */
function flagFields(): Field[] {
  return [
    { name: 'useFlag', type: 'checkbox', label: 'Use (사용)', defaultValue: false },
    { name: 'requiredFlag', type: 'checkbox', label: 'Required (필수)', defaultValue: false },
    { name: 'listFlag', type: 'checkbox', label: 'Show in list (목록)', defaultValue: false },
    { name: 'detailFlag', type: 'checkbox', label: 'Show in detail (보기)', defaultValue: false },
    { name: 'searchFlag', type: 'checkbox', label: 'Searchable (검색)', defaultValue: false },
  ]
}

/**
 * Attachment allowed-extension list format (ref 1-34): comma-separated,
 * lowercase, no spaces, e.g. `hwp,pdf,png`. Empty is allowed (field is
 * optional). A custom `validate` REPLACES Payload's default validator, so the
 * (non-required) empty case is handled explicitly here — see the identical
 * note on `validateSiteId` in `src/collections/Sites.ts`.
 */
const validateAllowedExtensions: TextFieldSingleValidation = (value) => {
  if (value === undefined || value === null || value === '') {
    return true
  }
  if (typeof value !== 'string' || !/^[a-z0-9]+(,[a-z0-9]+)*$/.test(value)) {
    return 'Enter extensions in lowercase, comma-separated, no spaces — e.g. "hwp,pdf,png".'
  }
  return true
}

/**
 * Assigns the `bbsId` (`Bxxxxxxx`) on create and enforces the integrated-board
 * restriction (ref 1-27): an `isIntegrated` board is locked to board type
 * PG0001 and the common skin. Effective values are merged from `data` over
 * `originalDoc` so a partial update (which may omit unchanged fields) is still
 * validated against the board's real resulting state.
 *
 * Runs in `beforeValidate` (collection) so the generated `bbsId` is present
 * before the field's `unique` validation runs (mirrors `codes/Codes.ts`); the
 * DB unique index is the race backstop — see `generateNextSequentialId`.
 */
const assignBbsIdAndEnforce: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) {
    return data
  }

  if (
    operation === 'create' &&
    (data.bbsId === undefined || data.bbsId === null || data.bbsId === '')
  ) {
    data.bbsId = await generateNextSequentialId(
      req.payload,
      'boards',
      'bbsId',
      BBS_ID_PREFIX,
      BBS_ID_PAD,
      req,
    )
  }

  // Tenant-membership enforcement on write. Payload's access layer applies the
  // per-user tenant `Where` (src/access/tenantAccess.ts) to read/update/delete,
  // but NOT to create — a `Where` can't constrain a not-yet-existing row — so a
  // crafted create with another site's tenant would otherwise slip past. Guard
  // it here for authenticated NON-super writers: the effective tenant must be
  // one they're assigned to. System/seed writes (no `req.user`) and super-admins
  // are exempt; the access-layer `Where` still covers update/delete.
  if (req.user && !isSuperUser(req.user)) {
    const effectiveTenant = toRelationId('tenant' in data ? data.tenant : originalDoc?.tenant)
    if (effectiveTenant !== undefined) {
      const assigned = getAssignedTenantIds(req.user)
      if (!assigned.some((id) => String(id) === String(effectiveTenant))) {
        throw new APIError("You are not assigned to this board's site (tenant).", 403)
      }
    }
  }

  const isIntegrated = 'isIntegrated' in data ? data.isIntegrated : originalDoc?.isIntegrated
  if (isIntegrated) {
    const boardTypeId = toRelationId('boardType' in data ? data.boardType : originalDoc?.boardType)
    if (boardTypeId === undefined) {
      throw new APIError(
        `An integrated board requires the integrated board type (${INTEGRATED_BOARD_TYPE_CODE}).`,
        400,
      )
    }

    const boardType = await req.payload.findByID({
      collection: 'boardTypes',
      id: boardTypeId,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (boardType.code !== INTEGRATED_BOARD_TYPE_CODE) {
      throw new APIError(
        `An integrated board must use board type ${INTEGRATED_BOARD_TYPE_CODE} (integrated); received "${boardType.code}".`,
        400,
      )
    }

    const skin = ('skin' in data ? data.skin : originalDoc?.skin) ?? 'common'
    if (skin !== 'common') {
      throw new APIError('An integrated board must use the common skin.', 400)
    }
  }

  return data
}

/**
 * Legacy 통합/커스텀 게시판 관리 (Integrated/Custom Board Management — refs
 * 1-27..1-35). The board CONFIGURATION model (posts come in Task 3B).
 * TENANT-SCOPED: the multi-tenant plugin (see `payload.config.ts`) adds a
 * required `tenant` relationship → `sites`, so every board belongs to exactly
 * one site. Both the legacy "integrated" and "custom" board screens collapse
 * into this one collection, discriminated by `isIntegrated`.
 *
 * ── Field-grid → posts schema (drives Task 3B) ──────────────────────────
 * `fields[]` (defaulted from `BOARD_DEFAULT_FIELDS`) is the canonical list of
 * every post column. Built-ins map to named `posts` columns; `extraField1-4`
 * map to varchar(4000) columns and `extraContent1-4` to text columns (legacy
 * fixed types, ref 1-30). The main rich body is a separate core post field
 * (Editor/HTML/TEXT), not part of this grid. See task-3A-report.md.
 *
 * ── XSS note ────────────────────────────────────────────────────────────
 * `topContent`/`bottomContent`/`headerNotice` are raw admin-authored HTML
 * rendered verbatim on the public board (ref 1-28). They must be sanitized at
 * render time in Phase 4 — flagged here, deferred to the rendering task.
 *
 * ── Skin note ───────────────────────────────────────────────────────────
 * `skin` (common vs site) is stored as the admin's choice only. Legacy
 * resolved it to a JSP path (`/WEB-INF/jsp/{cmmn|site}/bbs/{PGcode}/*.jsp`);
 * the rebuild renders via React, so the path mapping is deferred to Phase 4.
 */
export const Boards: CollectionConfig = {
  slug: 'boards',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['bbsId', 'name', 'boardType', 'securityDoc', 'attachmentsEnabled'],
    // Visible in the nav to content admins (ordinary boards) AND privacy-role
    // admins (the §3 security-document boards) — the collection's `access` below
    // filters WHICH boards each actually sees. `content.boards` alone would hide
    // the collection from a privacy-only admin who legitimately manages the
    // security docs.
    hidden: ({ user }) =>
      !hasMenuAccessSync(user, 'content.boards') &&
      !hasMenuAccessSync(user, SECURITY_DOCS_MENU_KEY),
  },
  // Menu-gated AND tenant-scoped, with the §3 security-document split (Task 6D):
  // ordinary boards are gated on `content.boards`; boards flagged
  // `securityDoc: true` (the four mounted §3 libraries — ref 3-4) are gated on
  // `privacy.securityDocs` instead, so a general content admin never sees them.
  // Super-admins access every site's boards of both classes. Public read for the
  // Phase 4 site comes later. See src/access/securityDocs.ts + tenantAccess.ts
  // for why this is enforced here rather than via the plugin's global switch.
  access: {
    create: securityDocScopedAccess('content.boards'),
    read: securityDocScopedAccess('content.boards'),
    update: securityDocScopedAccess('content.boards'),
    delete: securityDocScopedAccess('content.boards'),
  },
  fields: [
    // ── Basic settings (ref 1-28, 1-34) ──────────────────────────────────
    {
      name: 'bbsId',
      type: 'text',
      unique: true,
      // System-generated, never client-set: field-level write access denies
      // every create/update so a crafted API call can't supply or mutate the
      // value. The beforeValidate hook sets it via the normal (non-override)
      // data path — collection hooks run after field-access has already
      // stripped any client-supplied `bbsId` — and seeds pass it through with
      // overrideAccess, which bypasses field access.
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description: 'System-assigned board ID (Bxxxxxxx), auto-generated on create.',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    // §3 security-document flag (Task 6D; ref 3-4). When true, this board is one
    // of the four Privacy-Protection-System document libraries and is gated on
    // `privacy.securityDocs` (NOT `content.boards`) — see the collection `access`
    // and src/access/securityDocs.ts. Field-level write access requires the
    // privacy grant, so a content admin can neither SET nor CLEAR the flag (it is
    // stripped from their writes, defaulting a crafted create back to an ordinary
    // board); seeds pass it through with overrideAccess.
    {
      name: 'securityDoc',
      type: 'checkbox',
      defaultValue: false,
      access: {
        create: menuFieldAccess(SECURITY_DOCS_MENU_KEY),
        update: menuFieldAccess(SECURITY_DOCS_MENU_KEY),
      },
      admin: {
        description:
          'Privacy §3 security-document library (ref 3-4). Gated on Privacy · Security Documents instead of Board Management.',
      },
    },
    {
      name: 'boardType',
      type: 'relationship',
      relationTo: 'boardTypes',
      required: true,
      admin: {
        description:
          "The board's type (from Board Type Management). Locked to the integrated type when Integrated board is checked.",
      },
    },
    {
      name: 'isIntegrated',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: `Integrated board — locks board type to ${INTEGRATED_BOARD_TYPE_CODE} and skin to common (ref 1-27).`,
      },
    },
    {
      name: 'skin',
      type: 'select',
      defaultValue: 'common',
      options: [
        { label: 'Common skin (공통)', value: 'common' },
        { label: "This site's skin", value: 'site' },
      ],
      admin: {
        description:
          'Skin choice only. React rendering resolves this in Phase 4 (legacy JSP path mapping deferred).',
      },
    },
    {
      name: 'boardForm',
      type: 'select',
      defaultValue: 'list',
      options: [
        { label: 'List (리스트형)', value: 'list' },
        { label: 'Thumbnail (썸네일형)', value: 'thumbnail' },
      ],
      admin: {
        description: 'Board form — list or thumbnail (gallery) layout (ref 1-28 callout 4).',
      },
    },
    {
      name: 'sortOrder',
      type: 'select',
      defaultValue: 'latest',
      options: [
        { label: 'Latest first', value: 'latest' },
        { label: 'Oldest first', value: 'oldest' },
      ],
    },
    {
      name: 'editorForAdminOnly',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Rich-text editor is available to admins only; end users never get it (ref 1-28).',
      },
    },
    { name: 'commentsEnabled', type: 'checkbox', defaultValue: false },
    { name: 'prevNextEnabled', type: 'checkbox', defaultValue: false },
    { name: 'excelExport', type: 'checkbox', defaultValue: false },
    { name: 'userPostAllowed', type: 'checkbox', defaultValue: false },
    {
      name: 'secretPostAllowed',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Allow public/private (secret) posts (공개/비공개, ref 1-28).' },
    },
    {
      name: 'newIconWindow',
      type: 'number',
      defaultValue: 3,
      admin: {
        description:
          'Days a post shows the New icon after registration (ref 1-28 New icon toggle).',
      },
    },
    { name: 'listCount', type: 'number', defaultValue: 10 },
    { name: 'pageCount', type: 'number', defaultValue: 10 },
    {
      name: 'topContent',
      type: 'textarea',
      admin: {
        description: 'Raw HTML rendered above the board. Sanitize on render in Phase 4 (XSS).',
      },
    },
    {
      name: 'bottomContent',
      type: 'textarea',
      admin: {
        description: 'Raw HTML rendered below the board. Sanitize on render in Phase 4 (XSS).',
      },
    },
    {
      name: 'headerNotice',
      type: 'textarea',
      admin: {
        description: 'Configurable notice banner shown at the top of the board (ref 2-7).',
      },
    },
    // ── Attachment settings (ref 1-34) ───────────────────────────────────
    { name: 'attachmentsEnabled', type: 'checkbox', defaultValue: false },
    {
      name: 'attachmentMaxCount',
      type: 'number',
      defaultValue: 1,
      admin: { condition: (_data, siblingData) => Boolean(siblingData?.attachmentsEnabled) },
    },
    {
      name: 'attachmentMaxSizeMB',
      type: 'number',
      defaultValue: 10,
      admin: {
        condition: (_data, siblingData) => Boolean(siblingData?.attachmentsEnabled),
        description: '10 MByte recommended (legacy hint).',
      },
    },
    {
      name: 'attachmentAllowedExtensions',
      type: 'text',
      validate: validateAllowedExtensions,
      admin: {
        condition: (_data, siblingData) => Boolean(siblingData?.attachmentsEnabled),
        description: 'Lowercase, comma-separated, no spaces — e.g. "hwp,pdf,png".',
      },
    },
    // ── Category settings (ref 1-29, 1-35) — up to 3 code-group bindings ──
    {
      name: 'categories',
      type: 'array',
      maxRows: 3,
      labels: { singular: 'Category', plural: 'Categories' },
      admin: {
        description:
          'Up to 3 classification-code bindings. Each binds a pre-existing code GROUP (분류코드) — see report for the codeGroups-vs-codes decision.',
      },
      fields: [
        {
          name: 'classificationCode',
          type: 'relationship',
          relationTo: 'codeGroups',
          required: true,
          admin: {
            description:
              'The bound classification code group (must pre-exist in Code Management — popup selection only in legacy).',
          },
        },
        { name: 'title', type: 'text', admin: { description: 'Display label for this category.' } },
        {
          name: 'htmlTitleAttr',
          type: 'text',
          admin: { description: 'Value for the HTML title attribute.' },
        },
        {
          name: 'attributeValue',
          type: 'text',
          admin: { description: 'Injected HTML attributes, e.g. data="12".' },
        },
        {
          name: 'style',
          type: 'text',
          admin: { description: 'Inline CSS for the rendered input.' },
        },
        ...flagFields(),
      ],
    },
    // ── Field settings grid (ref 1-30) — drives the posts schema (Task 3B) ─
    {
      name: 'fields',
      type: 'array',
      defaultValue: BOARD_DEFAULT_FIELDS,
      labels: { singular: 'Field config', plural: 'Field configs' },
      admin: {
        description:
          'Per-field config for every post column. Defaults to the built-in fields + extraField1-4 (varchar) + extraContent1-4 (text). Drives the posts schema in Task 3B.',
      },
      fields: [
        {
          name: 'fieldKey',
          type: 'text',
          required: true,
          admin: { description: "Stable key, e.g. 'title', 'extraField1'." },
        },
        { name: 'label', type: 'text' },
        { name: 'htmlTitleAttr', type: 'text' },
        { name: 'attributeValue', type: 'text', admin: { description: 'e.g. data="12".' } },
        { name: 'style', type: 'text' },
        {
          name: 'inputType',
          type: 'select',
          defaultValue: 'text',
          options: selectOptions(FIELD_INPUT_TYPES),
          admin: {
            description: 'HTML input element the field renders as (ref 1-30 Type selector).',
          },
        },
        ...flagFields(),
      ],
    },
    // ── Ordering (ref 1-31, 1-32) — independent list/detail column order ──
    {
      name: 'listFieldOrder',
      type: 'text',
      hasMany: true,
      defaultValue: DEFAULT_LIST_FIELD_ORDER,
      admin: {
        description:
          'Ordered fieldKeys for the LIST view columns (ref 1-31). Drag-drop UI is later.',
      },
    },
    {
      name: 'detailFieldOrder',
      type: 'text',
      hasMany: true,
      defaultValue: DEFAULT_DETAIL_FIELD_ORDER,
      admin: {
        description: 'Ordered fieldKeys for the DETAIL view (ref 1-32). Independent of list order.',
      },
    },
  ],
  // Post EXCEL/CSV export (Task 3D / TODO 3.10, ref 2-7): GET /api/boards/:id/export.
  // Access-gated (must read the board) + tenant-scoped; honors the board's
  // list-field columns + the multi-criteria search — see boardExport.ts.
  endpoints: [boardExportEndpoint],
  hooks: {
    beforeValidate: [assignBbsIdAndEnforce],
    afterChange: [boardsAudit.afterChange],
    afterDelete: [boardsAudit.afterDelete],
  },
}
