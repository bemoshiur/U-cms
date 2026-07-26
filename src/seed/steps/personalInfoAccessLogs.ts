import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * Seeds a couple of example personal-info access logs (Task 6A; refs 3-8, 1-36)
 * so the Privacy > Personal Info Access History list renders with data out of
 * the box (a masked view + edit + export row against a demo member on the demo
 * site). Written with `overrideAccess` (the collection denies `create` to
 * everyone, including super — only the system writer may insert).
 *
 * Idempotent: seeds ONLY when there are NO rows yet, so a re-run — and,
 * crucially, real captured accesses — are never duplicated or clobbered.
 */
export const personalInfoAccessLogsStep: SeedStep = {
  name: 'personal-info-access-logs',
  async run(payload: Payload) {
    const existing = await payload.find({
      collection: 'personalInfoAccessLogs',
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      payload.logger.info('[seed:personal-info-access-logs] rows already present — skipping.')
      return
    }

    // Best-effort context from the demo site + a seeded member, so the sample
    // rows carry realistic subject/site ids (falls back to placeholders).
    const site = (
      await payload.find({
        collection: 'sites',
        where: { siteId: { equals: 'demo' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
    ).docs[0]
    const member = site
      ? (
          await payload.find({
            collection: 'members',
            where: { tenant: { equals: site.id } },
            limit: 1,
            pagination: false,
            overrideAccess: true,
          })
        ).docs[0]
      : undefined

    const subjectLabel = member
      ? `${(member as { name?: string }).name ?? 'Demo Member'}(${(member as { loginId?: string }).loginId ?? 'demo-member'})`
      : 'Demo Member(demo-member)'
    const subjectMemberId = member ? String(member.id) : '0'
    const subjectSiteId = site ? String(site.id) : '0'
    const viewerLabel = 'System Administrator(admin)'

    const samples = [
      {
        action: 'view' as const,
        purposeCategory: 'view' as const,
        purposeDetail: undefined as string | undefined,
        screen: 'member-detail',
        url: `/admin/collections/members/${subjectMemberId}`,
        dayOffset: 2,
      },
      {
        action: 'edit' as const,
        purposeCategory: 'edit' as const,
        purposeDetail: undefined,
        screen: 'member-detail',
        url: `/admin/collections/members/${subjectMemberId}`,
        dayOffset: 1,
      },
      {
        action: 'export' as const,
        purposeCategory: 'export' as const,
        purposeDetail: 'Monthly membership reconciliation report',
        screen: 'member-list-export',
        url: '/api/members/export',
        dayOffset: 0,
      },
    ]

    for (const s of samples) {
      await payload.create({
        collection: 'personalInfoAccessLogs',
        data: {
          occurredAt: new Date(Date.now() - s.dayOffset * 86_400_000).toISOString(),
          screen: s.screen,
          subjectLabel: s.action === 'export' ? '(bulk member export)' : subjectLabel,
          subjectMemberId: s.action === 'export' ? '*' : subjectMemberId,
          subjectSiteId,
          url: s.url,
          action: s.action,
          purposeCategory: s.purposeCategory,
          purposeDetail: s.purposeDetail,
          viewerLabel,
          viewerId: '0',
          ipAddress: '127.0.0.1',
        },
        overrideAccess: true,
      })
    }
    payload.logger.info(`[seed:personal-info-access-logs] created ${samples.length} example rows.`)
  },
}
