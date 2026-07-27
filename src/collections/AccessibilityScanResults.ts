import type { CollectionConfig } from 'payload'

import { ACCESSIBILITY_MENU_KEY } from '../accessibility/constants'
import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../access/tenantAccess'
import { auditCollection } from '../audit/auditCollection'
import { accessibilityStatsEndpoints } from '../endpoints/accessibilityStatsExport'

/** Permanent menu-grant key gating this collection + the views + exports. */
export { ACCESSIBILITY_MENU_KEY }

/** Access-history audit hooks (Task 2A) for scan-result writes/deletes. */
const accessibilityAudit = auditCollection(ACCESSIBILITY_MENU_KEY, {
  menuLabel: '웹접근성 자동진단 (Web Accessibility Auto-Diagnosis)',
})

/** Field-access lock: fields a client-panel write can never set directly. */
const serverForced = { create: () => false, update: () => false } as const

/**
 * 웹접근성 자동진단 결과 (Web Accessibility Auto-Diagnosis Results) — feature-inventory
 * refs 2-21/2-22/2-23 (Phase 8, Task 8.2). ONE row per inspected screen per scan
 * run: the 2-21 summary columns (total/success/error + 심각/위험/경고 severity
 * breakdown) + the per-violation detail (denormalized `violations` JSON) that
 * backs the 2-22 detail pane (axe rule id / description / helpUrl / occurrence
 * count / offending HTML + failureSummary). Rows are written by the ops/CI scan
 * runner (`scripts/accessibility-scan.ts`) and by the public validation-mode
 * DB-store endpoint, both via `overrideAccess`.
 *
 * ## Pragmatic substitute (plan §2.7) — NOT the legacy KWCAG overlay engine
 *
 * The legacy shipped a bespoke 33-item KWCAG-2.2 live on-page overlay validator.
 * Plan §2.7 descopes that in favour of axe-core scanning + this admin report; so
 * the stored data is axe's taxonomy (rule id + impact), MAPPED onto the legacy
 * 심각/위험/경고 severity strip — not a 33-rule KWCAG dataset. The 2-22 "detail"
 * view reads THIS stored result (helpUrl + failureSummary + offending HTML)
 * instead of re-rendering a live overlay on the target page.
 *
 * ## TENANT-SCOPED (matches the Phase-5 stats collections)
 *
 * Like `pageViews` / `satisfactionRatings` / `trafficDaily`, results are per-site
 * (a scan targets one site's screens; the 2-21 list carries a 사이트 column). So
 * this collection is opted into the multi-tenant plugin (payload.config.ts) and
 * gated with `tenantScopedMenuAccess(statistics.accessibility)` — a non-super
 * admin sees only their assigned sites' results; `isSuper` sees all. Inherits the
 * Phase-7 2FA confinement through `hasMenuAccess` (no bespoke access fn).
 */
export const AccessibilityScanResults: CollectionConfig = {
  slug: 'accessibilityScanResults',
  admin: {
    group: 'Statistics',
    useAsTitle: 'screenName',
    defaultColumns: [
      'screenName',
      'route',
      'errorCount',
      'criticalCount',
      'dangerCount',
      'warningCount',
      'inspectedAt',
    ],
    description:
      '웹접근성 자동진단 결과 (axe-core 기반). 자동 진단은 접근성 문제의 일부만 탐지합니다 — 전문가 수동 점검 병행 필요.',
    hidden: ({ user }) => !hasMenuAccessSync(user, ACCESSIBILITY_MENU_KEY),
  },
  defaultSort: '-inspectedAt',
  access: {
    create: tenantScopedMenuAccess(ACCESSIBILITY_MENU_KEY),
    read: tenantScopedMenuAccess(ACCESSIBILITY_MENU_KEY),
    update: tenantScopedMenuAccess(ACCESSIBILITY_MENU_KEY),
    delete: tenantScopedMenuAccess(ACCESSIBILITY_MENU_KEY),
  },
  // Aggregations are per-site over time (2-21 list + 2-23 monthly trend).
  indexes: [{ fields: ['tenant', 'inspectedAt'] }],
  endpoints: accessibilityStatsEndpoints,
  fields: [
    {
      name: 'screenName',
      type: 'text',
      required: true,
      admin: { description: '화면명 (Inspected screen name), e.g. 공지사항목록.' },
    },
    {
      name: 'route',
      type: 'text',
      required: true,
      admin: { description: 'The inspected path, e.g. /board/notice.' },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'scan',
      options: [
        { label: 'Scan runner (axe-core/Playwright)', value: 'scan' },
        { label: 'Public popup check', value: 'popup' },
        { label: 'Public DB-store', value: 'db' },
      ],
      admin: { description: 'How this result was produced.' },
    },
    {
      name: 'inspectedAt',
      type: 'date',
      required: true,
      index: true,
      defaultValue: () => new Date().toISOString(),
      admin: { description: '검사일시 (Inspection datetime) — the monthly-trend axis.' },
    },
    {
      name: 'totalItems',
      type: 'number',
      defaultValue: 0,
      admin: { description: '전체건수 (Total checked rules: passes + violations + incomplete).' },
    },
    {
      name: 'successCount',
      type: 'number',
      defaultValue: 0,
      admin: { description: '성공건수 (Passing rules).' },
    },
    {
      name: 'errorCount',
      type: 'number',
      defaultValue: 0,
      admin: { description: '에러건수 (Violated rules = 심각+위험+경고).' },
    },
    {
      name: 'criticalCount',
      type: 'number',
      defaultValue: 0,
      admin: { description: '심각 (Critical) — axe impact critical.' },
    },
    {
      name: 'dangerCount',
      type: 'number',
      defaultValue: 0,
      admin: { description: '위험 (Danger) — axe impact serious.' },
    },
    {
      name: 'warningCount',
      type: 'number',
      defaultValue: 0,
      admin: { description: '경고 (Warning) — axe impact moderate/minor.' },
    },
    {
      name: 'violations',
      type: 'json',
      access: serverForced,
      admin: {
        readOnly: true,
        description:
          '오류 상세 (Per-violation detail): [{ruleId, description, severity, impact, occurrenceCount, helpUrl, sampleHtml, failureSummary, tags}] — feeds the 2-22 detail pane.',
      },
    },
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard('tenant')],
    afterChange: [accessibilityAudit.afterChange],
    afterDelete: [accessibilityAudit.afterDelete],
  },
}
