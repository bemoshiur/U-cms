import type { Payload } from 'payload'

import { summarizeAxeResults } from '../../accessibility/scanResult'
import type { SeedStep } from '../types'

/**
 * Web-accessibility auto-diagnosis demo seed (Phase 8, Task 8.2; refs
 * 2-21/2-22/2-23). Layers an idempotent, representative scan snapshot on the demo
 * site so the results list (2-21), per-screen detail (2-22) and monthly
 * statistics / itemized report (2-23) all render NON-EMPTY like the manual:
 *
 *  - a couple dozen scan-result rows: ~4 screens × ~6 months, with a plausible
 *    downward error trend + realistic axe violations across all three severity
 *    buckets (심각/위험/경고), so the strip + trend + itemized report look real;
 *  - the DEMO SITE's validation mode set to a non-off value (popup_db) so the
 *    public toggle (TODO 8.3) is demonstrable out of the box.
 *
 * Every count is derived by `summarizeAxeResults` from the seeded violations, so
 * the stored numbers are internally consistent with the detail rows. Idempotent:
 * each result is keyed by (tenant, route, inspectedAt) before create; the site
 * mode is only written when it differs.
 */

/** A sample axe violation (raw-axe shape) → run through `summarizeAxeResults`. */
type SampleRule = {
  id: string
  impact: 'critical' | 'serious' | 'moderate' | 'minor'
  help: string
  helpUrl: string
  tags: string[]
  nodeCount: number
}

/** Catalog of realistic axe rules spanning every severity bucket. */
const RULE_CATALOG: SampleRule[] = [
  {
    id: 'image-alt',
    impact: 'critical',
    help: '이미지에 대체 텍스트를 제공해야 합니다 (Images must have alternate text)',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
    tags: ['wcag2a', 'wcag111', 'cat.text-alternatives'],
    nodeCount: 3,
  },
  {
    id: 'label',
    impact: 'critical',
    help: '폼 요소에는 레이블이 있어야 합니다 (Form elements must have labels)',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
    tags: ['wcag2a', 'wcag412', 'cat.forms'],
    nodeCount: 2,
  },
  {
    id: 'link-name',
    impact: 'serious',
    help: '링크에는 식별 가능한 텍스트가 있어야 합니다 (Links must have discernible text)',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/link-name',
    tags: ['wcag2a', 'wcag412', 'cat.name-role-value'],
    nodeCount: 4,
  },
  {
    id: 'color-contrast',
    impact: 'serious',
    help: '텍스트와 배경의 명도 대비가 충분해야 합니다 (Elements must meet minimum color contrast)',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
    tags: ['wcag2aa', 'wcag143', 'cat.color'],
    nodeCount: 6,
  },
  {
    id: 'landmark-one-main',
    impact: 'moderate',
    help: '문서에는 하나의 main 랜드마크가 있어야 합니다 (Document must have one main landmark)',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/landmark-one-main',
    tags: ['best-practice', 'cat.semantics'],
    nodeCount: 1,
  },
  {
    id: 'region',
    impact: 'moderate',
    help: '모든 콘텐츠는 랜드마크에 포함되어야 합니다 (All content must be contained in landmarks)',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/region',
    tags: ['best-practice', 'cat.keyboard'],
    nodeCount: 5,
  },
  {
    id: 'heading-order',
    impact: 'minor',
    help: '제목 레벨이 순서대로여야 합니다 (Heading levels should increase by one)',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/heading-order',
    tags: ['best-practice', 'cat.semantics'],
    nodeCount: 2,
  },
]

const SCREENS: { path: string; screenName: string }[] = [
  { path: '/', screenName: '메인화면 (Home)' },
  { path: '/board/notice', screenName: '공지사항목록 (Notice list)' },
  { path: '/login', screenName: '로그인화면 (Login)' },
  { path: '/terms/privacy', screenName: '개인정보처리방침 (Privacy policy)' },
]

/** N calendar months ending at (and including) `now`'s month, oldest-first. */
function recentMonths(now: Date, n: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  let y = now.getUTCFullYear()
  let m = now.getUTCMonth() + 1
  for (let i = 0; i < n; i++) {
    out.push({ year: y, month: m })
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  return out.reverse()
}

/** Builds a raw-axe rule with `nodeCount` sample nodes. */
function toAxeRule(rule: SampleRule) {
  return {
    id: rule.id,
    impact: rule.impact,
    description: rule.help,
    help: rule.help,
    helpUrl: rule.helpUrl,
    tags: rule.tags,
    nodes: Array.from({ length: rule.nodeCount }, (_, i) => ({
      html: `<div class="sample-${rule.id}-${i}">…</div>`,
      failureSummary: `Fix any of the following:\n  ${rule.id} violation on node ${i + 1}.`,
    })),
  }
}

export const accessibilityScanStep: SeedStep = {
  name: 'accessibility-scan',
  async run(payload: Payload) {
    // 1. Resolve the demo site + set a non-off validation mode (idempotent).
    const siteRes = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const demo = siteRes.docs[0]
    if (!demo) {
      payload.logger.info('[seed:accessibility] demo site not found — skipping.')
      return
    }
    if ((demo as { accessibilityValidation?: unknown }).accessibilityValidation !== 'popup_db') {
      await payload.update({
        collection: 'sites',
        id: demo.id,
        data: { accessibilityValidation: 'popup_db' },
        overrideAccess: true,
      })
      payload.logger.info('[seed:accessibility] set demo site validation mode → popup_db.')
    }

    // 2. Seed ~4 screens × ~6 months of scan results with a downward trend.
    const months = recentMonths(new Date(), 6)
    let created = 0

    for (let monthIdx = 0; monthIdx < months.length; monthIdx++) {
      const ym = months[monthIdx]!
      // Earlier months carry MORE violations (a plausible improving trend).
      const severityBudget = months.length - monthIdx // 6,5,4,3,2,1
      for (let screenIdx = 0; screenIdx < SCREENS.length; screenIdx++) {
        const screen = SCREENS[screenIdx]!
        // Deterministic per (month, screen): a rotating slice of the catalog,
        // trimmed by the month's budget so later months have fewer issues.
        const ruleCount = Math.max(
          0,
          Math.min(RULE_CATALOG.length, severityBudget - (screenIdx % 2)),
        )
        const rules = Array.from({ length: ruleCount }, (_, k) =>
          toAxeRule(RULE_CATALOG[(screenIdx + k) % RULE_CATALOG.length]!),
        )
        const passesCount = 40 + ((monthIdx + screenIdx) % 15)
        const summary = summarizeAxeResults({
          violations: rules,
          passes: new Array(passesCount).fill(0),
          incomplete: [],
        })

        const inspectedAt = `${ym.year}-${String(ym.month).padStart(2, '0')}-15T02:00:00.000Z`
        const existing = await payload.find({
          collection: 'accessibilityScanResults',
          where: {
            and: [
              { tenant: { equals: demo.id } },
              { route: { equals: screen.path } },
              { inspectedAt: { equals: inspectedAt } },
            ],
          },
          limit: 1,
          pagination: false,
          overrideAccess: true,
        })
        if (existing.docs.length > 0) continue

        await payload.create({
          collection: 'accessibilityScanResults',
          data: {
            tenant: demo.id,
            screenName: screen.screenName,
            route: screen.path,
            source: 'scan',
            inspectedAt,
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
        created += 1
      }
    }
    payload.logger.info(
      `[seed:accessibility] ensured demo accessibility scan results (+${created} created).`,
    )
  },
}
