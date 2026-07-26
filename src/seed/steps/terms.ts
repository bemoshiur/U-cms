import type { Payload } from 'payload'

import { TERMS_CATEGORIES } from '../../content/terms'
import type { SeedStep } from '../types'

/**
 * Seeds the five fixed privacy/terms documents on the demo site (Task 4E; refs
 * 2-14..2-16) so the public `/terms/[category]` pages + the member-consent seam
 * have real, PUBLISHED (active) content out of the box. The
 * `personalInfoProcessing` document gets a SECOND published version so the
 * public change-history table (ref 2-16) has something to show, and a superseded
 * version is retained as consent evidence.
 *
 * Runs AFTER `publicSiteStep` (needs the demo site) and BEFORE `membersStep` (so
 * seeded members snapshot the REAL active terms version). Idempotent: guarded by
 * (tenant, category) existence, so re-running `pnpm seed` adds nothing.
 */

export const TERMS_SEED_EFFECTIVE_DATE = '2026-01-01T00:00:00.000Z'

function lexical(...paragraphs: string[]) {
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        children: [
          { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 },
        ],
      })),
    },
  }
}

export const termsStep: SeedStep = {
  name: 'terms',
  async run(payload: Payload) {
    const found = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const demo = found.docs[0]
    if (!demo) {
      throw new Error('[seed:terms] demo site not found — did sitesStep run first?')
    }

    for (const category of TERMS_CATEGORIES) {
      const existing = await payload.find({
        collection: 'termsDocuments',
        where: {
          and: [{ tenant: { equals: demo.id } }, { category: { equals: category.value } }],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      if (existing.docs.length > 0) {
        payload.logger.info(`[seed:terms] "${category.value}" already exists — skipping.`)
        continue
      }

      const created = await payload.create({
        collection: 'termsDocuments',
        data: {
          tenant: demo.id,
          category: category.value,
          title: category.label,
          effectiveDate: TERMS_SEED_EFFECTIVE_DATE,
          content: lexical(
            `${category.label} (${category.korean})`,
            'This is example terms content for the demo site. Replace it with your real policy text.',
          ),
          _status: 'published',
        } as never,
        overrideAccess: true,
      })

      // Give the privacy document a second published version so the public
      // change-history shows a prior version (ref 2-16) and a superseded
      // version is retained for consent evidencing.
      if (category.value === 'personalInfoProcessing') {
        await payload.update({
          collection: 'termsDocuments',
          id: created.id,
          data: {
            title: `${category.label} (revised)`,
            effectiveDate: '2026-06-01T00:00:00.000Z',
            content: lexical(
              `${category.label} (${category.korean})`,
              'Revised example privacy terms — this is the current active version. The prior version remains in the change history below.',
            ),
            _status: 'published',
          } as never,
          overrideAccess: true,
        })
      }

      payload.logger.info(`[seed:terms] created "${category.value}".`)
    }
  },
}
