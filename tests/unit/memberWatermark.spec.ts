import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  buildMemberWatermarkData,
  composeMgmtNo,
  formatWatermarkTimestamp,
} from '@/members/watermark'

/**
 * Task 6B Part 1 — pure watermark derivation (ref 1-37). No React, no I/O: proves
 * the on-screen watermark data is SERVER-DERIVED and non-spoofable (viewer from
 * the actor object, timestamp + management# from the audit row or a deterministic
 * server-composed id).
 */

const viewer = { id: 42, name: '강현아', loginId: 'hakang00', email: 'a@x.com' }

describe('formatWatermarkTimestamp', () => {
  it('renders a stable, timezone-explicit UTC stamp', () => {
    expect(formatWatermarkTimestamp('2026-05-28T09:07:05.000Z')).toBe('2026-05-28 09:07:05 UTC')
  })
  it('defaults to a valid stamp for missing/garbage input', () => {
    expect(formatWatermarkTimestamp(undefined)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/)
    expect(formatWatermarkTimestamp('not-a-date')).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/,
    )
  })
})

describe('composeMgmtNo (deterministic, server-derived fallback)', () => {
  it('composes PIA-M<member>-U<viewer>-<yyyymmddHHmmss> from server inputs', () => {
    expect(composeMgmtNo({ memberId: 7, viewerId: 42, at: '2026-05-28T09:07:05.000Z' })).toBe(
      'PIA-M7-U42-20260528090705',
    )
  })
  it('is stable for the same access (pure function of its inputs)', () => {
    const a = composeMgmtNo({ memberId: 7, viewerId: 42, at: '2026-05-28T09:07:05.000Z' })
    const b = composeMgmtNo({ memberId: 7, viewerId: 42, at: '2026-05-28T09:07:05.000Z' })
    expect(a).toBe(b)
  })
  it('degrades to "anon" when the viewer id is unknown', () => {
    expect(
      composeMgmtNo({ memberId: 7, viewerId: undefined, at: '2026-05-28T09:07:05.000Z' }),
    ).toBe('PIA-M7-Uanon-20260528090705')
  })
})

describe('buildMemberWatermarkData', () => {
  it('prefers the real access-log row id as the management number', () => {
    const data = buildMemberWatermarkData({
      viewer,
      memberId: 7,
      accessLogId: 9001,
      occurredAt: '2026-05-28T09:07:05.000Z',
    })
    expect(data.mgmtNo).toBe('PIA-9001')
    // Viewer's OWN identity, shown in full (the deterrent signature).
    expect(data.viewerLabel).toBe('강현아(hakang00)')
    expect(data.viewerId).toBe('42')
    expect(data.timestamp).toBe('2026-05-28 09:07:05 UTC')
    // The tile text carries all three: viewer + timestamp + management#.
    expect(data.text).toContain('강현아(hakang00)')
    expect(data.text).toContain('2026-05-28 09:07:05 UTC')
    expect(data.text).toContain('PIA-9001')
  })

  it('falls back to the composed id when no access-log row id is available', () => {
    const data = buildMemberWatermarkData({
      viewer,
      memberId: 7,
      accessLogId: null,
      occurredAt: '2026-05-28T09:07:05.000Z',
    })
    expect(data.mgmtNo).toBe('PIA-M7-U42-20260528090705')
  })

  it('never leaves the viewer blank even for an unresolved actor', () => {
    const data = buildMemberWatermarkData({ viewer: { id: 5 }, memberId: 7 })
    expect(data.viewerLabel).toBe('5')
    expect(data.viewerId).toBe('5')
    expect(data.mgmtNo).toMatch(/^PIA-M7-U5-\d{14}$/)
  })
})

describe('watermark CSS covers both screen and print (ref 1-37)', () => {
  const scss = readFileSync(
    fileURLToPath(new URL('../../src/app/(payload)/custom.scss', import.meta.url)),
    'utf8',
  )

  it('renders on screen without blocking editing (fixed overlay, pointer-events: none)', () => {
    const block = scss.slice(scss.indexOf('.pii-watermark'))
    expect(block).toContain('position: fixed')
    expect(block).toContain('pointer-events: none')
  })

  it('is re-asserted (and ink forced) in an @media print block so it is not trivially removed', () => {
    const printIdx = scss.indexOf('@media print')
    expect(printIdx).toBeGreaterThan(-1)
    const printBlock = scss.slice(printIdx)
    expect(printBlock).toContain('.pii-watermark')
    expect(printBlock).toContain('print-color-adjust: exact')
  })
})
