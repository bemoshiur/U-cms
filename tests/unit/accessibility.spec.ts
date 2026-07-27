import { describe, expect, it } from 'vitest'

import { mapImpactToSeverity } from '@/accessibility/severity'
import { summarizeAxeResults } from '@/accessibility/scanResult'
import {
  isValidationActive,
  parseValidationMode,
  validationModeActions,
} from '@/accessibility/validationMode'

/**
 * Unit tests for the PURE accessibility cores (Phase 8, Task 8.2): the axe
 * `impact` → legacy 심각/위험/경고 severity mapping, the axe-results → stored-row
 * summarization (on a fixture), and the validation-mode → actions contract.
 */

describe('mapImpactToSeverity — axe impact → legacy taxonomy', () => {
  it('maps critical→critical(심각), serious→danger(위험), moderate/minor→warning(경고)', () => {
    expect(mapImpactToSeverity('critical')).toBe('critical')
    expect(mapImpactToSeverity('serious')).toBe('danger')
    expect(mapImpactToSeverity('moderate')).toBe('warning')
    expect(mapImpactToSeverity('minor')).toBe('warning')
  })

  it('treats null/undefined/unknown as the least-severe bucket (warning)', () => {
    expect(mapImpactToSeverity(null)).toBe('warning')
    expect(mapImpactToSeverity(undefined)).toBe('warning')
    expect(mapImpactToSeverity('bogus' as never)).toBe('warning')
  })
})

/** A representative axe run spanning all four impacts (+ a null impact). */
const AXE_FIXTURE = {
  violations: [
    {
      id: 'image-alt',
      impact: 'critical',
      description: 'Images must have alternate text',
      help: '이미지에 대체 텍스트를 제공해야 합니다',
      helpUrl: 'https://example.test/image-alt',
      tags: ['wcag2a', 'wcag111'],
      nodes: [
        { html: '<img src="a.png">', failureSummary: 'Fix: add alt' },
        { html: '<img src="b.png">', failureSummary: 'Fix: add alt' },
      ],
    },
    {
      id: 'link-name',
      impact: 'serious',
      description: 'Links must have discernible text',
      help: '링크에는 식별 가능한 텍스트가 있어야 합니다',
      helpUrl: 'https://example.test/link-name',
      tags: ['wcag2a'],
      nodes: [{ html: '<a href="#"></a>', failureSummary: 'Fix: add text' }],
    },
    {
      id: 'region',
      impact: 'moderate',
      help: 'All content must be in landmarks',
      helpUrl: 'https://example.test/region',
      tags: ['best-practice'],
      nodes: [{ html: '<div>x</div>', failureSummary: 'Fix: wrap in landmark' }],
    },
    {
      id: 'heading-order',
      impact: 'minor',
      help: 'Heading levels should increase by one',
      helpUrl: 'https://example.test/heading-order',
      tags: ['best-practice'],
      nodes: [{ html: '<h3>x</h3>' }],
    },
    {
      id: 'experimental-x',
      impact: null,
      help: 'Unclassified experimental rule',
      helpUrl: 'https://example.test/x',
      tags: [],
      nodes: [{ html: '<span>x</span>' }],
    },
  ],
  passes: new Array(5).fill({ id: 'p' }),
  incomplete: new Array(2).fill({ id: 'i' }),
  inapplicable: new Array(3).fill({ id: 'na' }),
}

describe('summarizeAxeResults — per-screen summary + severity partition', () => {
  const s = summarizeAxeResults(AXE_FIXTURE)

  it('counts pass/error and totals correctly', () => {
    expect(s.successCount).toBe(5)
    expect(s.errorCount).toBe(5)
    // totalItems = passes(5) + violations(5) + incomplete(2)
    expect(s.totalItems).toBe(12)
  })

  it('partitions errors into 심각/위험/경고 that sum to the error count', () => {
    expect(s.criticalCount).toBe(1) // image-alt (critical)
    expect(s.dangerCount).toBe(1) // link-name (serious)
    expect(s.warningCount).toBe(3) // region(moderate) + heading-order(minor) + null-impact
    expect(s.criticalCount + s.dangerCount + s.warningCount).toBe(s.errorCount)
  })

  it('denormalizes per-violation detail (rule/severity/occurrence/help/html/failure)', () => {
    const first = s.violations[0]!
    expect(first.ruleId).toBe('image-alt')
    expect(first.severity).toBe('critical')
    expect(first.occurrenceCount).toBe(2)
    expect(first.helpUrl).toBe('https://example.test/image-alt')
    expect(first.sampleHtml).toBe('<img src="a.png">')
    expect(first.failureSummary).toContain('add alt')
    expect(first.tags).toContain('wcag2a')
  })

  it('is defensive on empty/garbage input (all zeros, never throws)', () => {
    const empty = summarizeAxeResults({})
    expect(empty).toMatchObject({
      totalItems: 0,
      successCount: 0,
      errorCount: 0,
      criticalCount: 0,
      dangerCount: 0,
      warningCount: 0,
    })
    expect(empty.violations).toEqual([])
    // A totally malformed shape is tolerated.
    expect(() => summarizeAxeResults({ violations: 'nope' as never })).not.toThrow()
  })

  it('clamps violation count + truncates oversized strings (client-input safety)', () => {
    const many = summarizeAxeResults({
      violations: new Array(500).fill({
        id: 'x',
        impact: 'minor',
        help: 'h'.repeat(5000),
        nodes: [{ html: 'y'.repeat(5000), failureSummary: 'z'.repeat(5000) }],
      }),
    })
    expect(many.violations.length).toBe(200) // MAX_STORED_VIOLATIONS
    expect(many.violations[0]!.sampleHtml.length).toBeLessThanOrEqual(1000)
    expect(many.violations[0]!.failureSummary.length).toBeLessThanOrEqual(2000)
  })
})

describe('validationModeActions — ACS_VLD_USE_CD semantics', () => {
  it('off = no-op', () => {
    expect(validationModeActions('off')).toEqual({ showPopup: false, storeToDb: false })
    expect(isValidationActive('off')).toBe(false)
  })
  it('popup = popup only (AVU002 새창알림)', () => {
    expect(validationModeActions('popup')).toEqual({ showPopup: true, storeToDb: false })
    expect(isValidationActive('popup')).toBe(true)
  })
  it('db = store only (AVU003 DB저장)', () => {
    expect(validationModeActions('db')).toEqual({ showPopup: false, storeToDb: true })
    expect(isValidationActive('db')).toBe(true)
  })
  it('popup_db = both (AVU004)', () => {
    expect(validationModeActions('popup_db')).toEqual({ showPopup: true, storeToDb: true })
    expect(isValidationActive('popup_db')).toBe(true)
  })
  it('parseValidationMode coerces unknown/nullish to off', () => {
    expect(parseValidationMode('bogus')).toBe('off')
    expect(parseValidationMode(undefined)).toBe('off')
    expect(parseValidationMode(null)).toBe('off')
    expect(parseValidationMode('popup_db')).toBe('popup_db')
  })
})
