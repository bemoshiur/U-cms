import { describe, expect, it } from 'vitest'

import {
  type DashPost,
  mostViewed,
  nonSecret,
  recentPosts,
  recentQuestions,
  resolveVisibleMetricCards,
  resolveVisibleWidgets,
  todayTraffic,
  topNotices,
} from '@/content/dashboard'

/**
 * Task 5D — pure dashboard helpers (widget permission-filtering + list shaping).
 * The load-bearing invariant proven here (no Payload boot needed): two admins
 * with different menu grants get DIFFERENT widget/metric sets, and no list
 * surfaces a secret post.
 */

describe('resolveVisibleWidgets — permission filtering', () => {
  it('a super-admin sees every widget (in catalogue order)', () => {
    expect(resolveVisibleWidgets(new Set(), true)).toEqual([
      'traffic',
      'adminNotices',
      'notificationAreas',
      'recentPosts',
      'banners',
      'errorSummary',
      'quickMenu',
    ])
  })

  it('a roleless admin sees ONLY the always-on quick menu', () => {
    expect(resolveVisibleWidgets(new Set())).toEqual(['quickMenu'])
  })

  it('a limited admin (content.posts only) sees just posts + quick menu', () => {
    expect(resolveVisibleWidgets(new Set(['content.posts']))).toEqual(['recentPosts', 'quickMenu'])
  })

  it('grants map to exactly their backing widgets', () => {
    const widgets = resolveVisibleWidgets(new Set(['statistics.traffic', 'content.banners']))
    expect(widgets).toEqual(['traffic', 'banners', 'quickMenu'])
    // A different admin with a disjoint grant set → a disjoint widget set.
    const other = resolveVisibleWidgets(new Set(['system.errorLogs']))
    expect(other).toEqual(['errorSummary', 'quickMenu'])
    expect(widgets).not.toEqual(other)
  })
})

describe('resolveVisibleMetricCards — per-card gating', () => {
  it('super sees all five stat cards', () => {
    expect(resolveVisibleMetricCards(new Set(), true)).toEqual([
      'visitorsToday',
      'pageViewsToday',
      'newMembersToday',
      'postsToday',
      'postsTotal',
    ])
  })

  it('traffic-only grant → just the two traffic cards', () => {
    expect(resolveVisibleMetricCards(new Set(['statistics.traffic']))).toEqual([
      'visitorsToday',
      'pageViewsToday',
    ])
  })

  it('posts-only grant → just the two post cards', () => {
    expect(resolveVisibleMetricCards(new Set(['content.posts']))).toEqual([
      'postsToday',
      'postsTotal',
    ])
  })

  it('no grants → no stat cards', () => {
    expect(resolveVisibleMetricCards(new Set())).toEqual([])
  })
})

const posts: DashPost[] = [
  {
    id: 1,
    title: 'Public A',
    viewCount: 5,
    createdAt: '2026-07-20T00:00:00Z',
    boardKind: 'integrated',
  },
  { id: 2, title: 'SECRET', isSecret: true, viewCount: 999, createdAt: '2026-07-25T00:00:00Z' },
  { id: 3, title: 'Public B', viewCount: 50, createdAt: '2026-07-22T00:00:00Z', boardKind: 'qna' },
  { id: 4, title: 'Public C', viewCount: 10, createdAt: '2026-07-24T00:00:00Z', boardKind: 'qna' },
]

describe('post list shaping — secret exclusion + ordering', () => {
  it('nonSecret drops isSecret posts', () => {
    expect(nonSecret(posts).map((p) => p.id)).toEqual([1, 3, 4])
  })

  it('mostViewed orders by viewCount desc and NEVER surfaces a secret post', () => {
    const top = mostViewed(posts, 3)
    expect(top.map((p) => p.title)).toEqual(['Public B', 'Public C', 'Public A'])
    expect(top.some((p) => p.title === 'SECRET')).toBe(false)
  })

  it('recentPosts orders by createdAt desc (secret excluded)', () => {
    expect(recentPosts(posts, 5).map((p) => p.id)).toEqual([4, 3, 1])
  })

  it('recentQuestions keeps only qna-kind non-secret posts, newest first', () => {
    expect(recentQuestions(posts, 5).map((p) => p.id)).toEqual([4, 3])
  })

  it('honors the N limit', () => {
    expect(mostViewed(posts, 1).map((p) => p.id)).toEqual([3])
    expect(recentPosts(posts, 0)).toEqual([])
  })
})

describe('topNotices — pinned first, newest first', () => {
  it('sorts pinned above general, newest within group', () => {
    const notices = [
      { id: 1, noticeType: 'general', createdAt: '2026-07-25T00:00:00Z' },
      { id: 2, noticeType: 'pinned', createdAt: '2026-07-20T00:00:00Z' },
      { id: 3, noticeType: 'pinned', createdAt: '2026-07-24T00:00:00Z' },
      { id: 4, noticeType: 'general', createdAt: '2026-07-26T00:00:00Z' },
    ]
    expect(topNotices(notices, 10).map((n) => n.id)).toEqual([3, 2, 4, 1])
    expect(topNotices(notices, 2).map((n) => n.id)).toEqual([3, 2])
  })
})

describe('todayTraffic', () => {
  it('reads totals from the rollup, defaulting to zero when absent', () => {
    expect(todayTraffic({ totalViews: 42, uniqueVisitors: 10 })).toEqual({
      pageViews: 42,
      visitors: 10,
    })
    expect(todayTraffic(undefined)).toEqual({ pageViews: 0, visitors: 0 })
  })
})
