/**
 * Web-accessibility auto-diagnosis scan runner (Phase 8, Task 8.2; plan §2.7 —
 * the PRAGMATIC axe-core substitute for the legacy KWCAG overlay engine). Drives
 * a headless Chromium over a set of key RENDERED routes of a running app, runs
 * axe-core against each via `@axe-core/playwright`, maps axe `impact` onto the
 * legacy 심각/위험/경고 severity taxonomy (`src/accessibility/severity.ts`), and
 * persists ONE `accessibilityScanResults` row per screen (source `scan`) — the
 * data the 2-21 list / 2-22 detail / 2-23 statistics admin views read.
 *
 * This is the "axe-core in CI" the plan describes: it reads a running server
 * (start it first, e.g. `pnpm start`) and is safe to run in CI against a fresh
 * DB. axe-core + @axe-core/playwright are DEV dependencies, so this ops/CI-only
 * tooling never widens the runtime/audit surface.
 *
 * Usage:
 *   pnpm start &                              # (or a deployed URL)
 *   pnpm scan:accessibility                   # scan the demo site's default routes
 *   BASE_URL=http://localhost:3000 SCAN_SITE_ID=demo pnpm scan:accessibility
 *
 * Env:
 *   BASE_URL       base URL of the running app (default http://localhost:3000)
 *   SCAN_SITE_ID   siteId (tenant) whose screens are scanned + tagged (default demo)
 */
import 'dotenv/config'

import AxeBuilder from '@axe-core/playwright'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'

import { DEFAULT_SCAN_ROUTES } from '../src/accessibility/constants'
import { summarizeAxeResults } from '../src/accessibility/scanResult'
import config from '../src/payload.config'

async function main(): Promise<void> {
  const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const siteId = process.env.SCAN_SITE_ID || 'demo'

  const payload = await getPayload({ config })

  const siteRes = await payload.find({
    collection: 'sites',
    where: { siteId: { equals: siteId } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const site = siteRes.docs[0]
  if (!site) {
    payload.logger.error(`[a11y-scan] site "${siteId}" not found — seed it first.`)
    process.exit(1)
  }

  const browser = await chromium.launch()
  const now = new Date()
  let written = 0

  try {
    for (const route of DEFAULT_SCAN_ROUTES) {
      const page = await browser.newPage()
      try {
        await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'load', timeout: 30_000 })
        const axeResults = await new AxeBuilder({ page }).analyze()
        const summary = summarizeAxeResults(axeResults)
        await payload.create({
          collection: 'accessibilityScanResults',
          data: {
            tenant: site.id,
            screenName: route.screenName,
            route: route.path,
            source: 'scan',
            inspectedAt: now.toISOString(),
            totalItems: summary.totalItems,
            successCount: summary.successCount,
            errorCount: summary.errorCount,
            criticalCount: summary.criticalCount,
            dangerCount: summary.dangerCount,
            warningCount: summary.warningCount,
            violations: summary.violations,
          } as never,
          overrideAccess: true,
        })
        written += 1
        payload.logger.info(
          `[a11y-scan] ${route.path}: ${summary.errorCount} error(s) ` +
            `(심각 ${summary.criticalCount} / 위험 ${summary.dangerCount} / 경고 ${summary.warningCount}).`,
        )
      } catch (err) {
        payload.logger.warn(`[a11y-scan] ${route.path} failed: ${(err as Error)?.message}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  payload.logger.info(`[a11y-scan] wrote ${written} scan result(s) for site "${siteId}".`)
  process.exit(0)
}

void main()
