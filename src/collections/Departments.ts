import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
} from 'payload'
import { APIError } from 'payload'

import { toRelationId } from './utils'

/**
 * Rejects setting `parent` to the department itself or to any of its own
 * descendants, which would otherwise create a cycle in the tree. Walks up
 * the ancestor chain starting at the proposed new parent: if that walk ever
 * reaches the department being updated, the proposed parent is either the
 * department itself (first iteration) or one of its descendants.
 *
 * Only relevant on `update` — on `create` the document has no ID yet, so it
 * cannot already appear as an ancestor of anything.
 */
const preventParentCycle: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update') {
    return data
  }

  const parentId = toRelationId(data.parent)
  const currentId = originalDoc?.id
  if (parentId === undefined || currentId === undefined) {
    return data
  }

  const visited = new Set<string | number>()
  let ancestorId: string | number | undefined = parentId

  while (ancestorId !== undefined) {
    if (ancestorId === currentId) {
      throw new APIError(
        'Cannot set parent: a department cannot be its own parent or a descendant of itself (this would create a cycle).',
        400,
      )
    }
    if (visited.has(ancestorId)) {
      // Defensive only: pre-existing corrupted data forming a cycle above
      // us. Stop walking rather than looping forever — the new parent
      // isn't `currentId`, so there's nothing left to reject here.
      break
    }
    visited.add(ancestorId)

    const ancestor = await req.payload.findByID({
      collection: 'departments',
      id: ancestorId,
      req,
      overrideAccess: true,
      depth: 0,
    })

    ancestorId = toRelationId(ancestor?.parent)
  }

  return data
}

/**
 * Legacy allows deleting only leaf departments (inference from the manual —
 * not explicitly documented, but implied by the tree-editor UI never
 * offering a "reassign children" step). Blocks deletion whenever child
 * departments exist.
 */
const blockDeleteWithChildren: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const children = await req.payload.find({
    collection: 'departments',
    where: { parent: { equals: id } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })

  if (children.docs.length > 0) {
    throw new APIError(
      'Cannot delete a department that has child departments. Delete or reassign its children first.',
      400,
    )
  }
}

/**
 * Legacy 관리자 부서 관리 (Department Management) — ref 1-14. A self-relational
 * tree (Root > headquarters > teams…). Global (not tenant-scoped) —
 * departments are shared across all sites, per
 * docs/planning/development-plan.md §2.1's "global collections" list.
 *
 * `name` is `required` with no custom `validate` — Payload's default text
 * field validator already rejects `undefined`/empty-string when `required`
 * is set (see node_modules/payload/dist/fields/validations.js `text()`);
 * the Task 1A bug only appears when a *custom* `validate` is added on top of
 * `required`, since a custom `validate` replaces the default one instead of
 * layering on it. No extra format constraint applies to `name`, so no
 * custom `validate` is needed here at all — this is the simpler, equally
 * correct alternative to re-implementing the required check by hand.
 *
 * Note (accepted simplification, logged for a later UI pass): the legacy
 * tree-view/picker UI (expand/collapse-all, drag-reorder, popup picker
 * reused by other collections) is a custom-admin-component task for a later
 * phase. Phase 1 uses Payload's default list view + a plain `relationship`
 * field for `parent`.
 */
export const Departments: CollectionConfig = {
  slug: 'departments',
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['name', 'parent', 'isActive'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Department name (legacy 부서명).',
      },
    },
    {
      name: 'duties',
      type: 'textarea',
      admin: {
        description: 'Department duties/notes (legacy 부서업무).',
      },
    },
    {
      name: 'phone',
      type: 'text',
    },
    {
      name: 'fax',
      type: 'text',
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Legacy 사용여부. Inactive departments are hidden from pickers but kept (not deleted), so historical references keep resolving.',
      },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'departments',
      admin: {
        description: 'Parent department. Leave empty for a top-level department.',
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
  ],
  hooks: {
    beforeChange: [preventParentCycle],
    beforeDelete: [blockDeleteWithChildren],
  },
}
