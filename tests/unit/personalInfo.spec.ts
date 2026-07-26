import { describe, expect, it } from 'vitest'

import { resolveSubjectLabel } from '@/audit/recordPersonalInfoAccess'
import { memberRowsToCsv } from '@/endpoints/memberExport'
import {
  buildPersonalInfoLogsWhere,
  personalInfoLogsToCsvRows,
} from '@/endpoints/personalInfoLogsExport'

/**
 * Task 6A — pure helpers behind the personal-info audit subsystem (no I/O).
 */

describe('resolveSubjectLabel (member PII subject → "name(loginId)")', () => {
  it('builds name(loginId) from a member shape', () => {
    expect(resolveSubjectLabel({ id: 7, name: '강현아', loginId: 'hakang00' })).toBe(
      '강현아(hakang00)',
    )
  })
  it('falls back to email then id when loginId is absent', () => {
    expect(resolveSubjectLabel({ id: 7, name: 'A', email: 'a@x.com' })).toBe('A(a@x.com)')
    expect(resolveSubjectLabel({ id: 7, name: 'A' })).toBe('A(7)')
  })
  it('returns undefined for null/non-object', () => {
    expect(resolveSubjectLabel(null)).toBeUndefined()
    expect(resolveSubjectLabel(undefined)).toBeUndefined()
  })
})

describe('memberRowsToCsv — PII masked unless the privacy-officer tier', () => {
  const rows = [
    {
      id: 1,
      loginId: 'hakang00',
      name: '강현아',
      email: 'alice@example.com',
      mobile: '01012345678',
      status: 'active',
      createdAt: '2025-05-21T00:00:00.000Z',
      lastLoginAt: '2025-05-28T00:00:00.000Z',
      tenant: { id: 3 },
    },
  ]

  it('masks the PII columns for a plain members.manage admin (fullPii=false)', () => {
    const csv = memberRowsToCsv(rows, false)
    const [, dataRow] = csv
    expect(dataRow).toBeDefined()
    // No raw PII leaked.
    const flat = dataRow!.join('|')
    expect(flat).not.toContain('hakang00')
    expect(flat).not.toContain('강현아')
    expect(flat).not.toContain('alice@example.com')
    expect(flat).not.toContain('01012345678')
    // Masked shapes present.
    expect(dataRow).toContain('ha***0') // maskId(loginId)
    expect(dataRow).toContain('강*아') // maskName(name)
    expect(dataRow).toContain('a***@example.com') // maskEmail
    // Non-PII columns in the clear.
    expect(dataRow).toContain('active')
    expect(dataRow).toContain('3') // tenant id
  })

  it('emits full unmasked PII for the privacy officer (fullPii=true)', () => {
    const [, dataRow] = memberRowsToCsv(rows, true)
    expect(dataRow).toContain('hakang00')
    expect(dataRow).toContain('강현아')
    expect(dataRow).toContain('alice@example.com')
    expect(dataRow).toContain('01012345678')
  })
})

describe('personalInfoLogsToCsvRows — viewer/subject/IP masked', () => {
  it('masks the label + ip columns', () => {
    const rows = personalInfoLogsToCsvRows([
      {
        occurredAt: '2025-05-28T00:00:00.000Z',
        viewerLabel: 'System Admin(admin1)',
        subjectLabel: '강현아(hakang00)',
        screen: 'member-detail',
        url: '/admin/collections/members/7',
        action: 'view',
        purposeCategory: 'view',
        purposeDetail: '',
        ipAddress: '203.0.113.5',
        subjectSiteId: '3',
      },
    ])
    const flat = rows[1]!.join('|')
    expect(flat).not.toContain('hakang00')
    expect(flat).not.toContain('203.0.113.5')
    expect(flat).toContain('203.0.113.*')
    expect(flat).toContain('ha***0') // maskLabel masks the id part
  })
})

describe('buildPersonalInfoLogsWhere', () => {
  it('builds an inclusive end-of-day range + action + keyword OR', () => {
    const where = buildPersonalInfoLogsWhere({
      from: '2025-05-01',
      to: '2025-05-28',
      action: 'export',
      keyword: 'foo',
    }) as { and: Record<string, unknown>[] }
    expect(where.and).toBeDefined()
    const json = JSON.stringify(where)
    expect(json).toContain('2025-05-28T23:59:59.999Z')
    expect(json).toContain('export')
    expect(json).toContain('foo')
  })
  it('returns an empty where when no filters are given', () => {
    expect(buildPersonalInfoLogsWhere({})).toEqual({})
  })
})
