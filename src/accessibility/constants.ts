/**
 * Web-accessibility auto-diagnosis module — shared constants (Phase 8, Task 8.2;
 * 웹접근성 자동진단, feature-inventory refs 2-21/2-22/2-23; plan §2.7).
 *
 * ## Scope (plan §2.7 — the PRAGMATIC substitute, NOT the legacy KWCAG overlay)
 *
 * The legacy U-CMS shipped a bespoke 33-item KWCAG-2.2 overlay validator with a
 * live on-page popup. Plan §2.7 explicitly descopes that ("a full KWCAG overlay
 * engine is a product in itself") in favour of an **axe-core-based** scanner plus
 * an admin report/statistics page. This module reproduces the legacy SCREENS
 * (results list 2-21, per-screen detail 2-22, monthly statistics + itemized
 * report 2-23) backed by REAL axe-core data — it does NOT re-implement a 33-rule
 * engine or a live DOM overlay. See `src/accessibility/README`-style doc comments
 * on the scan runner + views for the explicit simplification notes.
 *
 * Single source of truth for the menu-grant key, the severity taxonomy labels,
 * the ACS_VLD_USE_CD validation-mode code set (ref 1-74), the scan routes, and
 * the honest automated-diagnosis disclaimer the legacy footer carries.
 */

/**
 * Menu-grant key gating the accessibility auto-diagnosis collection + the two
 * admin views + the export endpoints. Sits under the `statistics` group (legacy
 * menu path 사이트 통계 > 웹접근성 자동진단). Inherits the Phase-7 2FA confinement
 * through `hasMenuAccess` — no bespoke access fn.
 */
export const ACCESSIBILITY_MENU_KEY = 'statistics.accessibility'

/**
 * The legacy severity taxonomy (2-21 callout 4): errors are triaged into 심각
 * (critical) / 위험 (danger) / 경고 (warning). axe-core's `impact` is mapped onto
 * these in `src/accessibility/severity.ts`.
 */
export type LegacySeverity = 'critical' | 'danger' | 'warning'

/** Display labels (Korean + English) for each legacy severity bucket. */
export const SEVERITY_LABELS: Record<LegacySeverity, string> = {
  critical: '심각 (Critical)',
  danger: '위험 (Danger)',
  warning: '경고 (Warning)',
}

/** The ordered severity buckets (most → least severe), for stable column/report order. */
export const SEVERITY_ORDER: LegacySeverity[] = ['critical', 'danger', 'warning']

/**
 * The validation-mode code set (ref 1-74, ACS_VLD_USE_CD) that the `sites`
 * `accessibilityValidation` select maps onto (Task 1.1 gave the field the four
 * values off/popup/db/popup_db; Task 8.2 gives them real semantics):
 *  - AVU001 off        → no public-site validation
 *  - AVU002 popup      → 새창알림: client-side axe check shown in a popup/notice
 *  - AVU003 db         → DB저장: results POSTed to the DB-store endpoint (no popup)
 *  - AVU004 popup_db   → both
 */
export type ValidationMode = 'off' | 'popup' | 'db' | 'popup_db'

/** Maps each `sites.accessibilityValidation` value to its legacy ACS_VLD_USE_CD code. */
export const VALIDATION_MODE_CODE: Record<ValidationMode, string> = {
  off: 'AVU001',
  popup: 'AVU002',
  db: 'AVU003',
  popup_db: 'AVU004',
}

/**
 * How a stored scan result was produced — the on-demand CI/ops scan runner
 * (`scan`), or the public-site validation toggle in popup or db mode.
 */
export type ScanSource = 'scan' | 'popup' | 'db'

/** Diagnosis-standard header shown on the itemized report (2-23). */
export const DIAGNOSIS_STANDARD = 'axe-core (WCAG 2.x / KWCAG 2.2-aligned)'

/**
 * The honest disclaimer the legacy footer carries (2-23 주의사항): automated
 * diagnosis detects only a fraction (~30–57%) of accessibility issues; manual
 * expert review against the relevant criteria is still required.
 */
export const AUTOMATED_DIAGNOSIS_DISCLAIMER =
  '자동 진단은 전체 웹접근성 문제의 일부(약 30~57%)만 탐지할 수 있습니다. ' +
  '자동으로 진단할 수 없는 항목은 전문가의 수동 점검이 필요하며, 최종 준수 여부는 관련 접근성 기준·지표에 따라 별도로 검증해야 합니다. ' +
  'Automated diagnosis can detect only a fraction (~30–57%) of accessibility issues; ' +
  'items that cannot be diagnosed automatically require expert manual inspection, and ' +
  'final compliance must be verified against the relevant accessibility criteria.'

/**
 * Key public routes the ops/CI scan runner inspects on the demo site, with a
 * human-readable 화면명 (screen name, 2-21 column). The runner (scripts/
 * accessibility-scan.ts) prepends the base URL. Kept small + deterministic so a
 * CI scan is fast and repeatable; extend per site as needed.
 */
export const DEFAULT_SCAN_ROUTES: { path: string; screenName: string }[] = [
  { path: '/', screenName: '메인화면 (Home)' },
  { path: '/board/notice', screenName: '공지사항목록 (Notice list)' },
  { path: '/login', screenName: '로그인화면 (Login)' },
  { path: '/signup', screenName: '회원가입화면 (Sign-up)' },
  { path: '/terms/privacy', screenName: '개인정보처리방침 (Privacy policy)' },
]
