'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import type { ValidationMode } from '@/accessibility/constants'
import { validationModeActions } from '@/accessibility/validationMode'

/**
 * Public-site accessibility validator (Phase 8, Task 8.2 / TODO 8.3; ref 1-74
 * ACS_VLD_USE_CD; legacy 2-22 popup). Reads the active site's validation mode
 * (passed from the server layout) and:
 *   - off      → renders NOTHING and runs NOTHING (a true no-op);
 *   - popup    → 새창알림: runs a client-side axe-core check and shows a summary
 *                notice on the page;
 *   - db       → POSTs the results to `/accessibility-validation` (no notice);
 *   - popup_db → both.
 *
 * ## Lightweight · gated · non-blocking (brief constraints)
 *  - axe-core is a DEV dependency and is imported ONLY via a dynamic `import()`
 *    inside a `process.env.NODE_ENV !== 'production'` guard, so Next tree-shakes
 *    it out of the PRODUCTION client bundle entirely — the public site never
 *    ships or downloads axe in prod (also matching the legacy "operates only in
 *    local/dev environments" note, 2-16 callout 5).
 *  - The check runs in an idle `useEffect` AFTER paint, wrapped so it can never
 *    throw into React or block navigation. If mode is off (or prod), the effect
 *    returns immediately and no work is scheduled.
 */

type Summary = {
  errorCount: number
  criticalCount: number
  dangerCount: number
  warningCount: number
  top: { description: string; helpUrl: string; occurrences: number }[]
}

type AxeNode = { html?: string; failureSummary?: string }
type AxeRule = {
  id?: string
  impact?: string | null
  description?: string
  help?: string
  helpUrl?: string
  tags?: string[]
  nodes?: AxeNode[]
}
type AxeRun = { violations?: AxeRule[]; passes?: unknown[]; incomplete?: unknown[] }

/** critical→심각, serious→위험, else→경고 (mirrors src/accessibility/severity.ts). */
function bucket(impact: string | null | undefined): 'critical' | 'danger' | 'warning' {
  if (impact === 'critical') return 'critical'
  if (impact === 'serious') return 'danger'
  return 'warning'
}

/** Trims an axe run to the compact payload the server persists (bounded). */
function trimForPost(run: AxeRun, path: string, screenName: string) {
  const violations = (run.violations ?? []).slice(0, 200).map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: Array.isArray(v.tags) ? v.tags.slice(0, 30) : [],
    nodes: (v.nodes ?? []).slice(0, 5).map((n) => ({
      html: typeof n.html === 'string' ? n.html.slice(0, 1000) : '',
      failureSummary: typeof n.failureSummary === 'string' ? n.failureSummary.slice(0, 2000) : '',
    })),
  }))
  // passes/incomplete posted as length-only placeholder arrays (tiny JSON).
  const zeros = (n: number) => new Array(Math.min(n, 10000)).fill(0)
  return {
    path,
    screenName,
    axe: {
      violations,
      passes: zeros((run.passes ?? []).length),
      incomplete: zeros((run.incomplete ?? []).length),
    },
  }
}

/** Builds the on-page popup summary from an axe run. */
function summarize(run: AxeRun): Summary {
  const violations = run.violations ?? []
  let critical = 0
  let danger = 0
  let warning = 0
  for (const v of violations) {
    const b = bucket(v.impact)
    if (b === 'critical') critical += 1
    else if (b === 'danger') danger += 1
    else warning += 1
  }
  const top = violations
    .slice()
    .sort((a, b) => (b.nodes?.length ?? 0) - (a.nodes?.length ?? 0))
    .slice(0, 8)
    .map((v) => ({
      description: v.help || v.description || v.id || 'violation',
      helpUrl: v.helpUrl || '',
      occurrences: v.nodes?.length ?? 0,
    }))
  return {
    errorCount: violations.length,
    criticalCount: critical,
    dangerCount: danger,
    warningCount: warning,
    top,
  }
}

export function AccessibilityValidator({ mode }: { mode: ValidationMode }) {
  const pathname = usePathname()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const { showPopup, storeToDb } = validationModeActions(mode)

  useEffect(() => {
    // Hard no-op when nothing to do or in production (axe is dev/local only).
    if (process.env.NODE_ENV === 'production') return
    if (!showPopup && !storeToDb) return

    let cancelled = false

    // Defer until after paint so the page render is never blocked.
    const schedule = (fn: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number }
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn)
      else window.setTimeout(fn, 400)
    }

    schedule(() => {
      void (async () => {
        try {
          // DEV-ONLY dynamic import — the `NODE_ENV !== 'production'` guard is
          // inlined to `false` in prod builds, so the bundler statically drops
          // this `import('axe-core')` branch entirely (axe-core, a DEV dep, is
          // NEVER bundled or shipped to the production public site).
          const axeModule = process.env.NODE_ENV !== 'production' ? await import('axe-core') : null
          if (!axeModule) return
          const axe = axeModule.default
          const run = (await axe.run(document)) as unknown as AxeRun
          if (cancelled) return

          if (showPopup) {
            setDismissed(false)
            setSummary(summarize(run))
          }
          if (storeToDb) {
            const body = JSON.stringify(trimForPost(run, pathname, document.title || pathname))
            try {
              await fetch('/accessibility-validation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                keepalive: true,
              })
            } catch {
              // best-effort — never surface a store error to the visitor
            }
          }
        } catch {
          // axe failed to load/run — never break the public page
        }
      })()
    })

    return () => {
      cancelled = true
    }
  }, [pathname, showPopup, storeToDb])

  if (!showPopup || dismissed || !summary) return null

  return (
    <div
      role="dialog"
      aria-label="U-CMS 접근성 자가검진 결과"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 2147483000,
        width: 340,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '60vh',
        overflow: 'auto',
        background: '#fff',
        color: '#111',
        border: '1px solid #ccc',
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,.18)',
        padding: '12px 14px',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>
          U-CMS 접근성 자가검진: {summary.errorCount}가지의 지침 오류
        </strong>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="닫기"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 }}
        >
          ×
        </button>
      </div>
      <div style={{ margin: '6px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: '#b71c1c' }}>심각 {summary.criticalCount}</span>
        <span style={{ color: '#e65100' }}>위험 {summary.dangerCount}</span>
        <span style={{ color: '#f9a825' }}>경고 {summary.warningCount}</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {summary.top.map((t, i) => (
          <li key={i}>
            {t.description} ({t.occurrences})
            {t.helpUrl ? (
              <>
                {' '}
                <a href={t.helpUrl} target="_blank" rel="noreferrer">
                  도움말
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#666' }}>
        자동 진단은 접근성 문제의 일부(~30–57%)만 탐지합니다 — 전문가 수동 점검 병행 필요.
      </p>
    </div>
  )
}
