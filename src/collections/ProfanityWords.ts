import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../access/hasMenuAccess'
import { auditCollection } from '../audit/auditCollection'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const profanityAudit = auditCollection('content.profanityWords')

/** Stamps the creating admin onto `registrant` (ref 1-38 등록자). */
const setRegistrant: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation === 'create' && req.user && data && data.registrant === undefined) {
    data.registrant = req.user.id
  }
  return data
}

/**
 * Legacy 금칙어 관리 (Profanity/Forbidden-Word Management — refs 1-38/1-39).
 * A global (NOT tenant-scoped) admin-curated list; a `beforeValidate` hook on
 * `posts` rejects any post whose text contains an ACTIVE word (see Posts.ts +
 * src/content/wordFilter.ts). Deactivating a word disables it without deleting
 * it (activate/deactivate toggle). The bulk-delete + detail screens are just
 * this collection's default admin UI.
 */
export const ProfanityWords: CollectionConfig = {
  slug: 'profanityWords',
  admin: {
    group: 'Content',
    useAsTitle: 'word',
    defaultColumns: ['word', 'isActive', 'registrant', 'createdAt'],
    hidden: ({ user }) => !hasMenuAccessSync(user, 'content.profanityWords'),
  },
  access: menuAccessConfig('content.profanityWords'),
  fields: [
    {
      name: 'word',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'A forbidden word. Matching is case-insensitive substring.' },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Only active words are enforced against new posts.' },
    },
    {
      name: 'registrant',
      type: 'relationship',
      relationTo: 'users',
      access: { update: () => false },
      admin: {
        readOnly: true,
        description: 'The admin who registered this word (auto-set on create).',
      },
    },
  ],
  hooks: {
    beforeChange: [setRegistrant],
    afterChange: [profanityAudit.afterChange],
    afterDelete: [profanityAudit.afterDelete],
  },
}
