import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

/**
 * A custom `validate` REPLACES Payload's default required-checking
 * validator entirely (see the identical comment on `validateSiteId` in
 * src/collections/Sites.ts, fixed under Task 1A code review) — `required`
 * is threaded through `options.required` and enforced by hand here.
 */
const validateCodeGroupId: TextFieldSingleValidation = (value, { required }) => {
  if (required && (typeof value !== 'string' || value.length === 0)) {
    return 'Code ID is required.'
  }
  if (typeof value === 'string' && value.length > 0 && !/^[A-Z][A-Z0-9_]*$/.test(value)) {
    return 'Code ID must be uppercase snake_case starting with a letter (e.g. "APRV_CD") — legacy rule: it must equal the DB column name that consumes it.'
  }
  return true
}

/**
 * Legacy 공통 코드관리 (Common Code Management, list/register — refs 1-22/1-23).
 * A code group ("category") lives inside a `codeClassifications` namespace
 * and owns a set of hierarchical `codes` (detail codes). Global (not
 * tenant-scoped) — see docs/planning/development-plan.md §2.1.
 */
export const CodeGroups: CollectionConfig = {
  slug: 'codeGroups',
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['codeId', 'name', 'classification', 'isActive'],
  },
  fields: [
    {
      name: 'codeId',
      type: 'text',
      required: true,
      unique: true,
      validate: validateCodeGroupId,
      admin: {
        description:
          'Uppercase snake_case, matching the DB column name this code group backs, e.g. "APRV_CD".',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'classification',
      type: 'relationship',
      relationTo: 'codeClassifications',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
}
