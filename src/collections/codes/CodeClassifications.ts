import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../../access/hasMenuAccess'
import { auditCollection } from '../../audit/auditCollection'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const codeClassificationsAudit = auditCollection('system.codes.classifications')

/**
 * A custom `validate` REPLACES Payload's default required-checking
 * validator entirely (see the identical comment on `validateSiteId` in
 * src/collections/Sites.ts, fixed under Task 1A code review) — `required`
 * is threaded through `options.required` and enforced by hand here.
 */
const validateClassificationCode: TextFieldSingleValidation = (value, { required }) => {
  if (required && (typeof value !== 'string' || value.length === 0)) {
    return 'Classification code is required.'
  }
  if (typeof value === 'string' && value.length > 0 && !/^[A-Za-z]+$/.test(value)) {
    return 'Classification code must contain only English letters (A-Z, a-z), e.g. "SYS" or "CMS".'
  }
  return true
}

/**
 * Legacy 공통 분류 코드관리 (Common Classification Code Management) — refs
 * 1-25/1-26. One classification defines a per-sub-system namespace for
 * `codeGroups` (e.g. "SYS" for Pulse CMS's own baseline codes). Global (not
 * tenant-scoped) — see docs/planning/development-plan.md §2.1.
 */
export const CodeClassifications: CollectionConfig = {
  slug: 'codeClassifications',
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['code', 'name', 'isActive'],
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'system.codes.classifications'),
  },
  access: menuAccessConfig('system.codes.classifications'),
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      validate: validateClassificationCode,
      admin: {
        description: 'English-letters-only classification code, e.g. "SYS". One per sub-system.',
      },
    },
    {
      name: 'name',
      type: 'text',
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
  hooks: {
    afterChange: [codeClassificationsAudit.afterChange],
    afterDelete: [codeClassificationsAudit.afterDelete],
  },
}
