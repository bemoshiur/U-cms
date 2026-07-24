import type { CollectionBeforeDeleteHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../access/hasMenuAccess'
import { preventSelfReferentialCycle } from './utils'

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
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'system.departments'),
  },
  access: menuAccessConfig('system.departments'),
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
    beforeChange: [preventSelfReferentialCycle('departments')],
    beforeDelete: [blockDeleteWithChildren],
  },
}
