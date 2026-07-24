import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../../access/hasMenuAccess'
import { auditCollection } from '../../audit/auditCollection'
import { toRelationId } from '../utils'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const codesAudit = auditCollection('system.codes.detail')

/**
 * Computes `depth` and enforces every structural business rule for detail
 * codes (ref 1-24): code values are concatenated 2-digit segments per depth
 * (01 -> 0101 -> 010101…), a child's code must start with its parent's
 * code, a child's parent must belong to the same code group, and (group,
 * code) must be unique.
 *
 * Uniqueness has two deliberate layers: this hook's `find` lookup below
 * gives a fast, friendly "already exists" error in the common case, and the
 * collection's `indexes` config below (a real Postgres composite unique
 * index on `(group_id, code)`) is the correctness backstop for the race
 * where two requests pass this lookup concurrently. A violation of that
 * index surfaces as a normal `ValidationError` ("Value must be unique"),
 * not a raw 500 — Payload's Postgres adapter generically catches unique-
 * constraint violations (error code `23505`) for *any* index, not just
 * single-field ones, and converts them
 * (`@payloadcms/drizzle/dist/upsertRow/handleUpsertError.js`). No custom
 * error handling was needed here as a result.
 *
 * All of this runs in a single `beforeValidate` collection hook rather than
 * split across beforeValidate/beforeChange. Payload's real operation order
 * (`payload/dist/collections/operations/create.js`) is: "beforeValidate -
 * Fields" (runs each field's `field.hooks.beforeValidate[]` array — *not*
 * its `validate()` function) → "beforeValidate - Collections" (this hook)
 * → "beforeChange - Collection" → "beforeChange - Fields" (**this** is
 * where `field.validate()` actually runs and enforces plain `required` —
 * see `payload/dist/fields/hooks/beforeChange/promise.js`). So this hook
 * runs *before* the `code`/`group` fields' own required checks have fired
 * — hence the early-return guard right below when either is missing,
 * rather than assuming they're already known-valid. `depth` must be known
 * before the code-length check can run, and a later `beforeChange` hook
 * would run too late to gate validation on a freshly-computed value — so
 * this hook computes `depth` first, validates against it, and writes it
 * onto `data` so it's what actually gets persisted.
 */
const validateAndComputeDepth: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) {
    return data
  }

  const codeValue: unknown = 'code' in data ? data.code : originalDoc?.code
  const groupValue: unknown = 'group' in data ? data.group : originalDoc?.group
  const parentValue: unknown = 'parent' in data ? data.parent : originalDoc?.parent

  // If either is genuinely missing, there's nothing useful to cross-check
  // yet. This does NOT mean the fields' own `required` validators have
  // already rejected the request — this hook runs in "beforeValidate -
  // Collections", which fires *before* "beforeChange - Fields" (where
  // `field.validate()` actually enforces plain `required` — see the
  // top-of-function doc comment above for the full operation-order
  // citation). Return early rather than assuming the data is known-valid.
  if (
    typeof codeValue !== 'string' ||
    codeValue.length === 0 ||
    groupValue === undefined ||
    groupValue === null
  ) {
    return data
  }

  const groupId = toRelationId(groupValue)
  const parentId = toRelationId(parentValue)
  const currentId = originalDoc?.id

  if (parentId !== undefined && parentId === currentId) {
    throw new APIError('A code cannot be its own parent.', 400)
  }

  let depth = 1

  if (parentId !== undefined) {
    // Throws NotFound automatically if the parent doesn't exist (Payload's
    // default `findByID` behavior when `disableErrors` isn't set).
    const parentDoc = await req.payload.findByID({
      collection: 'codes',
      id: parentId,
      req,
      overrideAccess: true,
      depth: 0,
    })

    if (toRelationId(parentDoc.group) !== groupId) {
      throw new APIError('Parent code must belong to the same code group.', 400)
    }
    if (!codeValue.startsWith(parentDoc.code)) {
      throw new APIError(
        `Code "${codeValue}" must start with its parent code "${parentDoc.code}".`,
        400,
      )
    }

    if (typeof parentDoc.depth !== 'number') {
      // Should be unreachable — every code's `depth` is computed by this
      // same hook — but the field itself isn't `required` (it's
      // machine-computed, not admin-entered), so the generated type is
      // nullable. Fail loudly rather than silently miscomputing depth.
      throw new APIError(
        'Parent code is missing a computed depth; cannot compute child depth.',
        400,
      )
    }
    depth = parentDoc.depth + 1
  }

  if (!/^\d+$/.test(codeValue) || codeValue.length !== depth * 2) {
    throw new APIError(
      `Code must be exactly ${depth * 2} digit(s) for depth ${depth} (received "${codeValue}").`,
      400,
    )
  }

  // Friendly-error layer — see the DB-backstop `indexes` config at the
  // bottom of this file for the race-condition-proof layer.
  const duplicate = await req.payload.find({
    collection: 'codes',
    where: {
      and: [
        { group: { equals: groupId } },
        { code: { equals: codeValue } },
        ...(operation === 'update' && currentId !== undefined
          ? [{ id: { not_equals: currentId } }]
          : []),
      ],
    },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })

  if (duplicate.docs.length > 0) {
    throw new APIError(`Code "${codeValue}" already exists in this code group.`, 400)
  }

  data.depth = depth
  return data
}

/**
 * Legacy 공통 코드관리(공통 상세코드 관리 팝업) — ref 1-24. Hierarchical detail
 * codes inside a `codeGroups` group. Global (not tenant-scoped) — see
 * docs/planning/development-plan.md §2.1.
 *
 * Note (accepted simplification, logged for a later UI pass): the legacy
 * tree-view popup editor (expand/collapse-all, up/down reorder arrows) is a
 * custom-admin-component task for a later phase. Phase 1 uses Payload's
 * default list view + plain `relationship`/`number` fields for
 * `parent`/`order`.
 */
export const Codes: CollectionConfig = {
  slug: 'codes',
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['group', 'code', 'name', 'depth', 'isActive'],
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'system.codes.detail'),
  },
  access: menuAccessConfig('system.codes.detail'),
  // DB-level backstop for the `(group, code)` compound uniqueness rule
  // (see `validateAndComputeDepth` above for the friendly-error layer).
  // Payload supports native compound indexes — no hand-written migration
  // SQL needed; `pnpm migrate:create` generates the real Postgres unique
  // index from this config.
  indexes: [{ fields: ['group', 'code'], unique: true }],
  fields: [
    {
      name: 'group',
      type: 'relationship',
      relationTo: 'codeGroups',
      required: true,
    },
    {
      name: 'code',
      type: 'text',
      required: true,
      admin: {
        description:
          'Concatenated 2-digit-per-depth value, e.g. "01", "0101", "010101". Must start with the parent code, if any.',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'codes',
      admin: {
        description: 'Parent detail code. Leave empty for a top-level (depth 1) code.',
      },
    },
    {
      name: 'depth',
      type: 'number',
      admin: {
        readOnly: true,
        description: 'Computed automatically: 1 for a top-level code, otherwise parent depth + 1.',
      },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: 'Sibling display order (lower first).',
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'legacyValue',
      type: 'text',
      admin: {
        description:
          'Optional legacy code value from U-CMS v3.0 (e.g. "Y"/"I"/"N", "AVU001"), kept for audit parity.',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
  hooks: {
    beforeValidate: [validateAndComputeDepth],
    afterChange: [codesAudit.afterChange],
    afterDelete: [codesAudit.afterDelete],
  },
}
