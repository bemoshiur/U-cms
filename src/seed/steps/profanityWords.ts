import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * A few MILD, documented placeholder profanity words (refs 1-38/1-39). These
 * are intentionally non-slur placeholder tokens so this repo never ships real
 * slurs and so the seed posts (which must not contain any of these) stay
 * deterministic. Replace/extend via the admin UI in a real deployment.
 *
 * Exported so tests can assert against the same source of truth.
 */
export const SEED_PROFANITY_WORDS = ['badword', 'profanitysample', 'forbiddenterm'] as const

/**
 * Seeds the example profanity words. Idempotent: each word is looked up before
 * create, so re-running never duplicates.
 */
export const profanityWordsStep: SeedStep = {
  name: 'profanity-words',
  async run(payload: Payload) {
    for (const word of SEED_PROFANITY_WORDS) {
      const existing = await payload.find({
        collection: 'profanityWords',
        where: { word: { equals: word } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      if (existing.docs.length > 0) {
        payload.logger.info(`[seed:profanity-words] "${word}" already exists — skipping.`)
        continue
      }
      await payload.create({
        collection: 'profanityWords',
        data: { word, isActive: true },
        overrideAccess: true,
      })
      payload.logger.info(`[seed:profanity-words] created "${word}".`)
    }
  },
}
