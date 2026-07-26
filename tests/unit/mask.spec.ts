import { describe, expect, it } from 'vitest'

import { maskEmail, maskId, maskIp, maskLabel, maskName } from '@/lib/mask'

/**
 * Unit tests for the pure PII-masking helpers (Task 2A Part 5). Display-only
 * masking; the real value is always stored (see mask.ts).
 */
describe('maskId (ha***g style — keep first 2 + last 1)', () => {
  it('masks the legacy example', () => {
    expect(maskId('hasung')).toBe('ha***g')
  })

  it('uses a fixed 3-star middle regardless of length (no length leak)', () => {
    expect(maskId('administrator')).toBe('ad***r')
    expect(maskId('abcd')).toBe('ab***d')
  })

  it('degrades gracefully for short strings', () => {
    expect(maskId('')).toBe('')
    expect(maskId('a')).toBe('*')
    expect(maskId('ab')).toBe('a*')
    expect(maskId('abc')).toBe('a**')
  })

  it('tolerates a null/undefined-ish input', () => {
    expect(maskId(undefined as unknown as string)).toBe('')
  })
})

describe('maskName (keep first + last, star the middle)', () => {
  it('masks Korean names middle-out', () => {
    expect(maskName('홍길동')).toBe('홍*동')
    expect(maskName('강현아')).toBe('강*아')
  })

  it('matches middle length for longer names', () => {
    expect(maskName('John Doe')).toBe('J******e')
  })

  it('degrades gracefully', () => {
    expect(maskName('')).toBe('')
    expect(maskName('김')).toBe('*')
    expect(maskName('김수')).toBe('김*')
  })
})

describe('maskEmail (a***@domain)', () => {
  it('masks the local part, keeps the domain', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@example.com')
    expect(maskEmail('a@x.com')).toBe('a***@x.com')
  })

  it('handles a missing local part', () => {
    expect(maskEmail('@domain')).toBe('***@domain')
  })

  it('falls back to id masking when there is no @', () => {
    expect(maskEmail('notanemail')).toBe(maskId('notanemail'))
  })

  it('handles empty', () => {
    expect(maskEmail('')).toBe('')
  })
})

describe('maskLabel (name(id) composite)', () => {
  it('masks both the name and the id parts', () => {
    expect(maskLabel('강현아(hasung)')).toBe('강*아(ha***g)')
  })

  it('masks a bare label as a name', () => {
    expect(maskLabel('홍길동')).toBe('홍*동')
  })

  it('handles empty', () => {
    expect(maskLabel('')).toBe('')
  })
})

describe('maskIp (Task 5C — access-history "from where (masked)")', () => {
  it('stars the last octet of an IPv4 address', () => {
    expect(maskIp('203.0.113.5')).toBe('203.0.113.*')
    expect(maskIp('192.168.0.1')).toBe('192.168.0.*')
  })

  it('keeps the first two groups of an IPv6 address', () => {
    expect(maskIp('2001:db8::1')).toBe('2001:db8:***')
  })

  it('falls back to maskId for anything else, and handles empty', () => {
    expect(maskIp('unknown')).toBe(maskId('unknown'))
    expect(maskIp('')).toBe('')
  })
})
