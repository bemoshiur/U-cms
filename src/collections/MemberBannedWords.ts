import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../access/hasMenuAccess'
import { auditCollection } from '../audit/auditCollection'
import { MEMBER_BANNED_WORD_SCOPES } from '../content/wordFilter'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const memberBannedAudit = auditCollection('content.memberBannedWords')

/**
 * Legacy 회원 금칙어 관리 (Member Banned-Word Management — refs 1-40/1-41). A
 * global list of words disallowed in member sign-up, scoped to where they
 * apply (`common` = everywhere, `loginId`, `password`). Enforcement happens at
 * MEMBER signup, which is a Phase-4 collection — this task ships the data model
 * + the pure `checkBannedWord(value, scope, words)` predicate
 * (src/content/wordFilter.ts) with unit tests; Phase 4 wires the predicate into
 * the signup validators (the documented seam).
 */
export const MemberBannedWords: CollectionConfig = {
  slug: 'memberBannedWords',
  admin: {
    group: 'Content',
    useAsTitle: 'word',
    defaultColumns: ['word', 'scope', 'isActive', 'createdAt'],
    hidden: ({ user }) => !hasMenuAccessSync(user, 'content.memberBannedWords'),
  },
  access: menuAccessConfig('content.memberBannedWords'),
  // A word may legitimately repeat across scopes, so uniqueness is on the
  // (word, scope) pair rather than the word alone.
  indexes: [{ fields: ['word', 'scope'], unique: true }],
  fields: [
    {
      name: 'word',
      type: 'text',
      required: true,
      admin: { description: 'A banned word. Matching is case-insensitive substring.' },
    },
    {
      name: 'scope',
      type: 'select',
      required: true,
      defaultValue: 'common',
      options: MEMBER_BANNED_WORD_SCOPES.map((value) => ({ label: value, value })),
      admin: {
        description:
          'Where the word is banned: common (everywhere), loginId, or password (ref 1-41).',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Only active words are enforced at signup.' },
    },
  ],
  hooks: {
    afterChange: [memberBannedAudit.afterChange],
    afterDelete: [memberBannedAudit.afterDelete],
  },
}
