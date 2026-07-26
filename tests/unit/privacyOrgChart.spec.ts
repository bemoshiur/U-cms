import { describe, expect, it } from 'vitest'

import {
  buildPrivacyOrgChart,
  PRIVACY_ROLE_DEPUTY,
  PRIVACY_ROLE_OFFICER,
  PRIVACY_ROLE_STAFF,
  PRIVACY_ROLE_TEAM,
  type OrgChartAdmin,
} from '@/privacy/orgChart'

/**
 * Task 6C Part 2 (ref 3-10): the privacy org chart is DERIVED from role
 * assignments. Pure — no DB.
 */
describe('buildPrivacyOrgChart', () => {
  it('always returns the four tiers in officer → deputy → team → staff order', () => {
    const chart = buildPrivacyOrgChart([])
    expect(chart.map((t) => t.tier)).toEqual([1, 2, 3, 4])
    expect(chart.map((t) => t.roleId)).toEqual([
      PRIVACY_ROLE_OFFICER,
      PRIVACY_ROLE_DEPUTY,
      PRIVACY_ROLE_TEAM,
      PRIVACY_ROLE_STAFF,
    ])
  })

  it('renders every tier empty when no admin holds a privacy role', () => {
    const chart = buildPrivacyOrgChart([{ id: 1, name: 'Nobody', roleIds: ['ROLE_ADMIN'] }])
    expect(chart.every((t) => t.members.length === 0)).toBe(true)
  })

  it('places an admin in the tier of the privacy role they hold, with department', () => {
    const admins: OrgChartAdmin[] = [
      {
        id: 7,
        name: 'Kang',
        departmentName: 'Head Office',
        duties: '개인정보 보호 총괄',
        roleIds: [PRIVACY_ROLE_OFFICER],
      },
    ]
    const chart = buildPrivacyOrgChart(admins)
    const officer = chart[0]
    expect(officer.members).toHaveLength(1)
    expect(officer.members[0]).toMatchObject({
      id: 7,
      name: 'Kang',
      department: 'Head Office',
      duty: '개인정보 보호 총괄',
    })
    // Other tiers stay empty.
    expect(chart[1].members).toHaveLength(0)
    expect(chart[3].members).toHaveLength(0)
  })

  it('defaults a staff member with no own duties to the administrative-safeguards label', () => {
    const chart = buildPrivacyOrgChart([{ id: 4, name: 'Lee', roleIds: [PRIVACY_ROLE_STAFF] }])
    const staff = chart[3]
    expect(staff.members[0]?.duty).toBe('관리적 보호조치 (Administrative safeguards)')
    expect(staff.members[0]?.department).toBeNull()
  })

  it("uses the admin's own duties over the tier default", () => {
    const chart = buildPrivacyOrgChart([
      { id: 5, name: 'Park', duties: '기술적 보호조치', roleIds: [PRIVACY_ROLE_STAFF] },
    ])
    expect(chart[3].members[0]?.duty).toBe('기술적 보호조치')
  })

  it('places an admin holding multiple privacy roles into each of those tiers', () => {
    const chart = buildPrivacyOrgChart([
      { id: 9, name: 'Multi', roleIds: [PRIVACY_ROLE_OFFICER, PRIVACY_ROLE_STAFF] },
    ])
    expect(chart[0].members.map((m) => m.id)).toEqual([9]) // officer
    expect(chart[1].members).toHaveLength(0) // deputy
    expect(chart[3].members.map((m) => m.id)).toEqual([9]) // staff
  })

  it('falls back to a synthetic name when the admin has no name', () => {
    const chart = buildPrivacyOrgChart([{ id: 42, roleIds: [PRIVACY_ROLE_TEAM] }])
    expect(chart[2].members[0]?.name).toBe('(admin #42)')
  })

  it('RE-DERIVES when an assignment changes (staff → deputy moves tiers)', () => {
    const before = buildPrivacyOrgChart([{ id: 3, name: 'Mover', roleIds: [PRIVACY_ROLE_STAFF] }])
    expect(before[3].members.map((m) => m.id)).toEqual([3]) // staff before
    expect(before[1].members).toHaveLength(0) // deputy empty before

    const after = buildPrivacyOrgChart([{ id: 3, name: 'Mover', roleIds: [PRIVACY_ROLE_DEPUTY] }])
    expect(after[1].members.map((m) => m.id)).toEqual([3]) // deputy after
    expect(after[3].members).toHaveLength(0) // staff empty after
  })
})
