import { describe, expect, it } from 'vitest'

import {
  browserFamilyFromUserAgent,
  classifyPath,
  normalizePath,
  osFamilyFromUserAgent,
  OTHER_PATH_BUCKET,
} from '@/content/traffic'
import {
  buildTrackDedupKey,
  DEFAULT_TRACK_DEDUP_WINDOW_MIN,
  TrafficDedup,
} from '@/site/trafficDedup'

/**
 * Task 5A Part 0 (D6) + OS/browser derivation. Covers the coarse (version-free)
 * OS/browser families, the path canonicalization that buckets attacker paths to
 * `__other__`, and the per-(session, path) `/track` dedup window.
 */

describe('osFamilyFromUserAgent (coarse family — no version)', () => {
  it('classifies the common families', () => {
    expect(osFamilyFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(osFamilyFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')).toBe('macos')
    expect(osFamilyFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(
      'ios',
    )
    expect(osFamilyFromUserAgent('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe('ios')
    expect(osFamilyFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android')
    expect(osFamilyFromUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
  })

  it('is other for empty/unknown (never throws, never a version)', () => {
    expect(osFamilyFromUserAgent('')).toBe('other')
    expect(osFamilyFromUserAgent(null)).toBe('other')
    expect(osFamilyFromUserAgent('curl/8.0')).toBe('other')
  })
})

describe('browserFamilyFromUserAgent (coarse family — no version)', () => {
  it('disambiguates the nested UA brands (specific first)', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537 (KHTML) Chrome/120 Safari/537'
    const edge = `${chrome} Edg/120`
    const opera = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537 OPR/106'
    const samsung = 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/23 Chrome/115 Safari/537'
    const firefox = 'Mozilla/5.0 (Windows NT 10.0; rv:121) Gecko/20100101 Firefox/121'
    const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/17.0 Safari/605'
    const ie = 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko'
    expect(browserFamilyFromUserAgent(edge)).toBe('edge')
    expect(browserFamilyFromUserAgent(opera)).toBe('opera')
    expect(browserFamilyFromUserAgent(samsung)).toBe('samsung')
    expect(browserFamilyFromUserAgent(firefox)).toBe('firefox')
    expect(browserFamilyFromUserAgent(chrome)).toBe('chrome')
    expect(browserFamilyFromUserAgent(safari)).toBe('safari')
    expect(browserFamilyFromUserAgent(ie)).toBe('ie')
    expect(browserFamilyFromUserAgent('')).toBe('other')
  })
})

describe('classifyPath (D6 — bounded canonical routes)', () => {
  it('keeps exact static public routes', () => {
    for (const p of ['/', '/login', '/signup', '/recover', '/profile', '/sitemap', '/survey']) {
      expect(classifyPath(p)).toEqual({ kind: 'known', path: p })
    }
  })

  it('flags /page/{n} for menu validation (concrete, per-site)', () => {
    expect(classifyPath('/page/12')).toEqual({ kind: 'page', menuNumber: 12, path: '/page/12' })
    expect(classifyPath('/page/7/')).toEqual({ kind: 'page', menuNumber: 7, path: '/page/7' })
  })

  it('flags /board/{bbsId} for board validation and collapses post detail to the board', () => {
    expect(classifyPath('/board/B0000001')).toEqual({
      kind: 'board',
      bbsId: 'B0000001',
      path: '/board/B0000001',
    })
    // A post-detail path collapses to its board (bounded), still needing validation.
    expect(classifyPath('/board/B0000001/42')).toEqual({
      kind: 'board',
      bbsId: 'B0000001',
      path: '/board/B0000001',
    })
    // A non-board-shaped segment is not a board → other (no unbounded strings).
    expect(classifyPath('/board/not-a-board')).toEqual({ kind: 'other' })
  })

  it('template-collapses id-bearing routes to ONE bucket each', () => {
    expect(classifyPath('/survey/5')).toEqual({ kind: 'known', path: '/survey/[id]' })
    expect(classifyPath('/survey/999')).toEqual({ kind: 'known', path: '/survey/[id]' })
    expect(classifyPath('/terms/termsOfUse')).toEqual({ kind: 'known', path: '/terms/[category]' })
    expect(classifyPath('/s/abc123')).toEqual({ kind: 'known', path: '/s/[code]' })
    expect(classifyPath('/reset-password/[token]')).toEqual({
      kind: 'known',
      path: '/reset-password/[token]',
    })
  })

  it('buckets unknown / attacker-chosen paths to __other__', () => {
    for (const p of ['/aaaa1', '/wp-admin', '/foo/bar/baz', '/page/abc', '/page/-3']) {
      expect(classifyPath(p)).toEqual({ kind: 'other' })
    }
  })

  it('a normalized attacker path collapses to a single bucket regardless of the id', () => {
    // 1000 distinct junk paths must NOT create 1000 distinct stored paths.
    const buckets = new Set(
      Array.from({ length: 1000 }, (_, i) => {
        const c = classifyPath(normalizePath(`/junk-${i}`))
        return c.kind === 'other' ? OTHER_PATH_BUCKET : 'kept'
      }),
    )
    expect(buckets).toEqual(new Set([OTHER_PATH_BUCKET]))
  })
})

describe('TrafficDedup (per-(session,path) /track window)', () => {
  it('records the first sighting, drops repeats within the window, allows again after it', () => {
    let nowMs = 1_000_000
    const dedup = new TrafficDedup(10 * 60_000, () => nowMs)
    const key = 'sess|/page/5'
    expect(dedup.shouldRecord(key)).toBe(true) // first
    expect(dedup.shouldRecord(key)).toBe(false) // repeat within window
    nowMs += 5 * 60_000
    expect(dedup.shouldRecord(key)).toBe(false) // still within window
    nowMs += 6 * 60_000 // window elapsed
    expect(dedup.shouldRecord(key)).toBe(true) // allowed again
  })

  it('is independent per key ((session, path) pairs do not collide)', () => {
    const dedup = new TrafficDedup(10 * 60_000, () => 0)
    expect(dedup.shouldRecord('a|/x')).toBe(true)
    expect(dedup.shouldRecord('a|/y')).toBe(true)
    expect(dedup.shouldRecord('b|/x')).toBe(true)
    expect(dedup.shouldRecord('a|/x')).toBe(false)
  })

  it('buildTrackDedupKey is a stable one-way hash (no PII), rotates by day + varies by input', () => {
    const day = new Date('2026-07-20T12:00:00Z')
    const k = buildTrackDedupKey('203.0.113.7', 'UA', '/page/5', day)
    expect(k).toMatch(/^[0-9a-f]{64}$/)
    expect(k).not.toContain('203.0.113.7') // the raw IP never appears in the key
    // Deterministic for the same inputs...
    expect(buildTrackDedupKey('203.0.113.7', 'UA', '/page/5', day)).toBe(k)
    // ...different path, IP, or day → different key.
    expect(buildTrackDedupKey('203.0.113.7', 'UA', '/page/6', day)).not.toBe(k)
    expect(buildTrackDedupKey('203.0.113.8', 'UA', '/page/5', day)).not.toBe(k)
    expect(
      buildTrackDedupKey('203.0.113.7', 'UA', '/page/5', new Date('2026-07-21T12:00:00Z')),
    ).not.toBe(k)
  })

  it('exposes a sane default window', () => {
    expect(DEFAULT_TRACK_DEDUP_WINDOW_MIN).toBeGreaterThan(0)
  })
})
