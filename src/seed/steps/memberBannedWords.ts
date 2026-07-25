import type { Payload } from 'payload'

import type { MemberBannedWordScope } from '../../content/wordFilter'
import type { SeedStep } from '../types'

/**
 * A few example member banned words (refs 1-40/1-41), one per scope. Mild,
 * documented placeholders — extend via the admin UI in a real deployment.
 * Exported so tests can assert against the same source of truth.
 */
export const SEED_MEMBER_BANNED_WORDS: { word: string; scope: MemberBannedWordScope }[] = [
  { word: 'admin', scope: 'loginId' },
  { word: 'password', scope: 'password' },
  { word: 'forbiddenname', scope: 'common' },
]

/**
 * Seeds the example member banned words. Idempotent: each (word, scope) pair
 * is looked up before create, so re-running never duplicates.
 */
export const memberBannedWordsStep: SeedStep = {
  name: 'member-banned-words',
  async run(payload: Payload) {
    for (const entry of SEED_MEMBER_BANNED_WORDS) {
      const existing = await payload.find({
        collection: 'memberBannedWords',
        where: {
          and: [{ word: { equals: entry.word } }, { scope: { equals: entry.scope } }],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      if (existing.docs.length > 0) {
        payload.logger.info(
          `[seed:member-banned-words] "${entry.word}" (${entry.scope}) already exists — skipping.`,
        )
        continue
      }
      await payload.create({
        collection: 'memberBannedWords',
        data: { word: entry.word, scope: entry.scope, isActive: true },
        overrideAccess: true,
      })
      payload.logger.info(`[seed:member-banned-words] created "${entry.word}" (${entry.scope}).`)
    }
  },
}
