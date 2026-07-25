import { describe, expect, it } from 'vitest'

import { matchesUrlPattern, resolveHelp } from '@/content/help'
import type { HelpBinding } from '@/content/help'

describe('matchesUrlPattern (Task 3D help)', () => {
  it('matches an exact pattern', () => {
    expect(matchesUrlPattern('/bos/home', '/bos/home')).toBe(true)
    expect(matchesUrlPattern('/bos/home', '/bos/home/x')).toBe(false)
  })

  it('supports a "*" wildcard', () => {
    expect(matchesUrlPattern('/bos/board/*', '/bos/board/list')).toBe(true)
    expect(matchesUrlPattern('/bos/board/*', '/bos/other/list')).toBe(false)
    expect(matchesUrlPattern('*/list', '/bos/board/list')).toBe(true)
  })

  it('never matches an empty/absent pattern', () => {
    expect(matchesUrlPattern('', '/x')).toBe(false)
    expect(matchesUrlPattern(null, '/x')).toBe(false)
    expect(matchesUrlPattern(undefined, '/x')).toBe(false)
  })
})

describe('resolveHelp precedence (Task 3D; ref 1-80)', () => {
  const entries: (HelpBinding & { id: string })[] = [
    { id: 'svc', bindType: 'service', urlPattern: '/bos/home' },
    { id: 'menu', bindType: 'menu', menuNumber: 7 },
    { id: 'svc2', bindType: 'service', urlPattern: '/bos/board/*' },
  ]

  it('menu binding wins when both a menu number and URL match', () => {
    const hit = resolveHelp(entries, { url: '/bos/home', menuNumber: 7 })
    expect(hit?.id).toBe('menu')
  })

  it('falls back to a URL-pattern match when no menu entry matches the number', () => {
    const hit = resolveHelp(entries, { url: '/bos/home', menuNumber: 999 })
    expect(hit?.id).toBe('svc')
  })

  it('resolves a service match by URL when no menuNumber is given', () => {
    const hit = resolveHelp(entries, { url: '/bos/board/list' })
    expect(hit?.id).toBe('svc2')
  })

  it('returns undefined when nothing matches', () => {
    expect(resolveHelp(entries, { url: '/nope', menuNumber: 123 })).toBeUndefined()
    expect(resolveHelp(entries, {})).toBeUndefined()
  })

  it('ignores a menu entry whose menuNumber is unset', () => {
    const only = [{ id: 'm', bindType: 'menu' as const, menuNumber: null }]
    expect(resolveHelp(only, { menuNumber: 5 })).toBeUndefined()
  })
})
