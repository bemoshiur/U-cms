import type { Payload } from 'payload'

import type { SeedStep } from '../types'
import { SEED_MENU_ABOUT_INTRO } from './publicSite'
import { aggregateTrafficForDate, utcDayString } from '../../site/trafficAggregation'

/**
 * Seeds a few satisfaction ratings + page views on the demo site (Task 4E) and
 * rolls them up into `trafficDaily` (Task 5A) so the Phase-5 statistics module +
 * the traffic-statistics view render with real data out of the box. Views are
 * attributed to the Introduction content page + the home page, spread across the
 * last few days with varied OS/browser/device so the tabs are non-trivial.
 *
 * Idempotent: seeds only when the demo site has NO satisfaction ratings / NO
 * page views yet, so a re-run (and, crucially, accumulated real traffic) is not
 * duplicated; the aggregation upsert (run once, right after seeding the views)
 * is itself idempotent. Runs after `publicSiteStep` (needs the Introduction menu).
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

    // Link the Introduction menu to a department (담당부서) so the satisfaction
    // statistics DEPARTMENT → MENU cascade (Task 5B / ref 2-19) has a real
    // department to filter by. Idempotent: set only when personInCharge is unset.
    if (menu.personInCharge == null) {
      const dept = await payload.find({
        collection: 'departments',
        where: { name: { equals: 'Development' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const deptId = dept.docs[0]?.id
      if (deptId !== undefined) {
        await payload.update({
          collection: 'menus',
          id: menu.id,
          data: { personInCharge: { relationTo: 'departments', value: deptId } } as never,
          overrideAccess: true,
        })
        payload.logger.info('[seed:statistics] linked Introduction menu → Development department.')
      }
    }

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

    // ── page views + daily rollups (idempotent by site) ───────────────────
    const existingViews = await payload.find({
      collection: 'pageViews',
      where: { tenant: { equals: demo.id } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existingViews.docs.length === 0) {
      type Sample = {
        path: string
        menu?: number
        deviceType: 'mobile' | 'desktop'
        osFamily: string
        browserFamily: string
        session: string
        dayOffset: number
      }
      // Spread over the last 3 full days (never "today", so real traffic that
      // arrives today can't make a seeded rollup stale) with varied dimensions.
      const samples: Sample[] = [
        {
          path: '/',
          deviceType: 'desktop',
          osFamily: 'windows',
          browserFamily: 'chrome',
          session: 's1',
          dayOffset: 1,
        },
        {
          path: pageKey,
          menu: menu.id,
          deviceType: 'mobile',
          osFamily: 'ios',
          browserFamily: 'safari',
          session: 's2',
          dayOffset: 1,
        },
        {
          path: pageKey,
          menu: menu.id,
          deviceType: 'desktop',
          osFamily: 'macos',
          browserFamily: 'safari',
          session: 's1',
          dayOffset: 2,
        },
        {
          path: '/',
          deviceType: 'mobile',
          osFamily: 'android',
          browserFamily: 'chrome',
          session: 's3',
          dayOffset: 2,
        },
        {
          path: pageKey,
          menu: menu.id,
          deviceType: 'desktop',
          osFamily: 'windows',
          browserFamily: 'edge',
          session: 's4',
          dayOffset: 3,
        },
      ]
      const days = new Set<string>()
      for (const s of samples) {
        const ts = new Date(Date.now() - s.dayOffset * 86_400_000)
        days.add(utcDayString(ts))
        await payload.create({
          collection: 'pageViews',
          data: {
            tenant: demo.id,
            path: s.path,
            ...(s.menu ? { menu: s.menu } : {}),
            deviceType: s.deviceType,
            osFamily: s.osFamily,
            browserFamily: s.browserFamily,
            referrerHost: null,
            sessionKey: `seed-${s.session}`,
            ts: ts.toISOString(),
          } as never,
          overrideAccess: true,
        })
      }
      // Roll the seeded views up so the statistics view has data immediately.
      for (const day of days) {
        await aggregateTrafficForDate(payload, { tenantId: demo.id, date: day })
      }
      payload.logger.info(
        `[seed:statistics] created ${samples.length} page views + ${days.size} daily rollup(s).`,
      )
    }

    // ── download counts (idempotent by counter) ───────────────────────────
    // Seed a non-zero download count on the demo Gallery post's attachment so
    // the download-statistics view (Task 5B / ref 2-18) renders with data. Only
    // bumps when the counter is still 0, so accumulated real downloads are never
    // reset. `skipPostSideEffects` avoids re-running board validation / fileSn
    // renumbering on this counter-only write.
    const galleryPost = await payload.find({
      collection: 'posts',
      where: {
        and: [{ tenant: { equals: demo.id } }, { title: { equals: 'Sample gallery item' } }],
      },
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const post = galleryPost.docs[0]
    const attachments = post && Array.isArray(post.attachments) ? post.attachments : []
    if (post && attachments.length > 0 && (attachments[0]?.downloadCount ?? 0) === 0) {
      const updated = attachments.map((a, i) => (i === 0 ? { ...a, downloadCount: 12 } : a))
      await payload.update({
        collection: 'posts',
        id: post.id,
        data: { attachments: updated } as never,
        overrideAccess: true,
        context: { skipPostSideEffects: true },
      })
      payload.logger.info('[seed:statistics] seeded a download count on the Gallery attachment.')
    }
  },
}
