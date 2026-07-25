import { describe, expect, it } from 'vitest'

import {
  compareAdminNotices,
  isHttpUrl,
  isLive,
  isSafeInternalLink,
  reorder,
} from '@/content/display'

describe('display helpers (Task 3C)', () => {
  describe('isLive', () => {
    const now = new Date('2026-07-15T12:00:00.000Z')

    it('is live when active and inside the window', () => {
      expect(
        isLive(
          { active: true, exposeFrom: '2026-07-01T00:00:00Z', exposeTo: '2026-07-31T00:00:00Z' },
          now,
        ),
      ).toBe(true)
    })

    it('is not live when inactive, even inside the window', () => {
      expect(
        isLive(
          { active: false, exposeFrom: '2026-07-01T00:00:00Z', exposeTo: '2026-07-31T00:00:00Z' },
          now,
        ),
      ).toBe(false)
    })

    it('treats unset active as active (only false blocks)', () => {
      expect(isLive({ exposeFrom: '2026-07-01T00:00:00Z' }, now)).toBe(true)
    })

    it('is not live before the start', () => {
      expect(isLive({ active: true, exposeFrom: '2026-07-20T00:00:00Z' }, now)).toBe(false)
    })

    it('is not live after the end', () => {
      expect(isLive({ active: true, exposeTo: '2026-07-10T00:00:00Z' }, now)).toBe(false)
    })

    it('is live at the exact start boundary (inclusive)', () => {
      const start = new Date('2026-07-15T12:00:00.000Z')
      expect(isLive({ active: true, exposeFrom: '2026-07-15T12:00:00.000Z' }, start)).toBe(true)
    })

    it('is live at the exact end boundary (inclusive)', () => {
      const end = new Date('2026-07-15T12:00:00.000Z')
      expect(isLive({ active: true, exposeTo: '2026-07-15T12:00:00.000Z' }, end)).toBe(true)
    })

    it('respects hour precision on the bounds', () => {
      const at13 = new Date('2026-07-15T13:00:00.000Z')
      // window is 14:00 → 18:00; 13:00 is one hour too early → not live
      expect(
        isLive(
          { active: true, exposeFrom: '2026-07-15T14:00:00Z', exposeTo: '2026-07-15T18:00:00Z' },
          at13,
        ),
      ).toBe(false)
    })

    it('is live with no bounds at all', () => {
      expect(isLive({ active: true }, now)).toBe(true)
    })
  })

  describe('isHttpUrl', () => {
    it('accepts http and https absolute URLs', () => {
      expect(isHttpUrl('http://example.com')).toBe(true)
      expect(isHttpUrl('https://example.com/x?y=1')).toBe(true)
      expect(isHttpUrl('  https://example.com ')).toBe(true)
    })

    it('rejects relative paths, other schemes, and non-strings', () => {
      expect(isHttpUrl('/bos/internal')).toBe(false)
      expect(isHttpUrl('ftp://example.com')).toBe(false)
      expect(isHttpUrl('javascript:alert(1)')).toBe(false)
      expect(isHttpUrl('')).toBe(false)
      expect(isHttpUrl(undefined)).toBe(false)
      expect(isHttpUrl(42)).toBe(false)
    })
  })

  describe('isSafeInternalLink', () => {
    it('accepts genuine site-relative paths and query refs', () => {
      expect(isSafeInternalLink('/path')).toBe(true)
      expect(isSafeInternalLink('/bos/singl/deptinfo/list.do?menuSn=100085')).toBe(true)
      expect(isSafeInternalLink('?menuSn=1')).toBe(true)
      expect(isSafeInternalLink('/')).toBe(true)
    })

    it('rejects scheme, protocol-relative, backslash-authority, and off-site values', () => {
      expect(isSafeInternalLink('javascript:alert(1)')).toBe(false)
      expect(isSafeInternalLink('data:text/html,<script>alert(1)</script>')).toBe(false)
      expect(isSafeInternalLink('//evil.com')).toBe(false)
      expect(isSafeInternalLink('/\\evil.com')).toBe(false)
      expect(isSafeInternalLink('https://evil.com')).toBe(false)
      expect(isSafeInternalLink('http://evil.com')).toBe(false)
    })

    it('rejects control chars, bare relative segments, and non-strings', () => {
      expect(isSafeInternalLink('/path\twith\ttab')).toBe(false)
      expect(isSafeInternalLink('/evil\n//host')).toBe(false)
      expect(isSafeInternalLink('relative/path')).toBe(false)
      expect(isSafeInternalLink('')).toBe(false)
      expect(isSafeInternalLink(undefined)).toBe(false)
      expect(isSafeInternalLink(42)).toBe(false)
    })
  })

  describe('reorder (4-way move)', () => {
    const list = ['a', 'b', 'c', 'd']

    it('moves an item to the top', () => {
      expect(reorder(list, 2, 'top')).toEqual(['c', 'a', 'b', 'd'])
    })

    it('moves an item to the bottom', () => {
      expect(reorder(list, 1, 'bottom')).toEqual(['a', 'c', 'd', 'b'])
    })

    it('moves an item up one', () => {
      expect(reorder(list, 2, 'up')).toEqual(['a', 'c', 'b', 'd'])
    })

    it('moves an item down one', () => {
      expect(reorder(list, 1, 'down')).toEqual(['a', 'c', 'b', 'd'])
    })

    it('is a no-op at the edges and for out-of-range indices', () => {
      expect(reorder(list, 0, 'up')).toEqual(['a', 'b', 'c', 'd'])
      expect(reorder(list, 3, 'down')).toEqual(['a', 'b', 'c', 'd'])
      expect(reorder(list, 9, 'top')).toEqual(['a', 'b', 'c', 'd'])
    })

    it('does not mutate the input', () => {
      const input = ['x', 'y', 'z']
      reorder(input, 0, 'bottom')
      expect(input).toEqual(['x', 'y', 'z'])
    })
  })

  describe('compareAdminNotices', () => {
    it('sorts pinned notices above general ones', () => {
      const rows = [
        { noticeType: 'general', createdAt: '2026-07-10T00:00:00Z' },
        { noticeType: 'pinned', createdAt: '2026-07-01T00:00:00Z' },
        { noticeType: 'general', createdAt: '2026-07-11T00:00:00Z' },
        { noticeType: 'pinned', createdAt: '2026-07-05T00:00:00Z' },
      ]
      const sorted = [...rows].sort(compareAdminNotices)
      expect(sorted.map((r) => r.noticeType)).toEqual(['pinned', 'pinned', 'general', 'general'])
      // Newest first within each group.
      expect(sorted[0]!.createdAt).toBe('2026-07-05T00:00:00Z')
      expect(sorted[2]!.createdAt).toBe('2026-07-11T00:00:00Z')
    })
  })
})
