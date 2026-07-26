import type { Payload } from 'payload'

import type { SeedStep } from '../types'
import { SEED_MENU_ABOUT_INTRO } from './publicSite'

/**
 * Seeds a few satisfaction ratings + page views on the demo site (Task 4E) so
 * the Phase-5 statistics module has real rows to aggregate out of the box. Both
 * are attributed to the Introduction content page (`/page/{menuNumber}`).
 *
 * Idempotent: seeds only when the demo site has NO satisfaction ratings / NO
 * page views yet, so a re-run (and, crucially, accumulated real traffic) is not
 * duplicated. Runs after `publicSiteStep` (needs the Introduction menu).
 */
export const statisticsStep: SeedStep = {
  name: 'statistics',
  async run(payload: Payload) {
    const sites = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const demo = sites.docs[0]
    if (!demo) {
      throw new Error('[seed:statistics] demo site not found — did sitesStep run first?')
    }

    // Resolve the Introduction content menu (the rated/viewed page).
    const introMenu = await payload.find({
      collection: 'menus',
      where: {
        and: [{ tenant: { equals: demo.id } }, { name: { equals: SEED_MENU_ABOUT_INTRO } }],
      },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const menu = introMenu.docs[0]
    if (!menu || typeof menu.menuNumber !== 'number') {
      payload.logger.info('[seed:statistics] Introduction menu not found — skipping.')
      return
    }
    const pageKey = `/page/${menu.menuNumber}`

    // ── satisfaction ratings (idempotent by page) ─────────────────────────
    const existingRatings = await payload.find({
      collection: 'satisfactionRatings',
      where: { and: [{ tenant: { equals: demo.id } }, { pageKey: { equals: pageKey } }] },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existingRatings.docs.length === 0) {
      for (const score of [5, 4, 3]) {
        await payload.create({
          collection: 'satisfactionRatings',
          data: {
            tenant: demo.id,
            menu: menu.id,
            pageKey,
            score,
            member: null,
            submittedAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        })
      }
      payload.logger.info('[seed:statistics] created 3 satisfaction ratings.')
    }

    // ── page views (idempotent by site) ───────────────────────────────────
    const existingViews = await payload.find({
      collection: 'pageViews',
      where: { tenant: { equals: demo.id } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existingViews.docs.length === 0) {
      const samples: { path: string; menu?: number; deviceType: 'mobile' | 'desktop' }[] = [
        { path: '/', deviceType: 'desktop' },
        { path: pageKey, menu: menu.id, deviceType: 'mobile' },
        { path: pageKey, menu: menu.id, deviceType: 'desktop' },
      ]
      for (const s of samples) {
        await payload.create({
          collection: 'pageViews',
          data: {
            tenant: demo.id,
            path: s.path,
            ...(s.menu ? { menu: s.menu } : {}),
            deviceType: s.deviceType,
            referrerHost: null,
            sessionKey: 'seed',
            ts: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        })
      }
      payload.logger.info('[seed:statistics] created 3 page views.')
    }
  },
}
