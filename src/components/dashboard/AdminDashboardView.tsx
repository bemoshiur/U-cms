// Every `href` in this file targets a PAYLOAD admin route (`/admin/...`), served
// by Payload's own catch-all `[[...segments]]` route — NOT an app-router page
// `next/link` knows about. A full-navigation `<a>` is the correct, reliable way
// to move between server-rendered Payload views (same reasoning documented on
// `StatisticsNavLink`); the rule's page-path heuristic false-positives here.
/* eslint-disable @next/next/no-html-link-for-pages */
import type { PayloadRequest } from 'payload'
import React from 'react'

import { getAssignedTenantIds } from '@/access/tenantAccess'
import { isSuperUser } from '@/access/hasMenuAccess'
import { branding } from '@/branding'
import { loadDashboardData, type DashboardData } from '@/site/dashboardData'

/**
 * The permission-filtered admin dashboard (Task 5D; refs 1-7 / 1-8) — the
 * `/admin` landing view. Registered as `admin.components.views.dashboard`, which
 * Payload's built-in `DashboardView` renders IN PLACE OF its `DefaultDashboard`
 * (verified in `@payloadcms/next/dist/views/Dashboard/index.js`: it calls
 * `RenderServerComponent({ Component: config.admin.components.views.dashboard
 * .Component, Fallback: DefaultDashboard, ... })`). So this replaces the default
 * "collection cards" homepage with a widget dashboard aggregating the whole
 * system.
 *
 * SERVER component. It reads the caller from `initPageResult.req`, resolves the
 * active SITE (per-site widgets), and delegates ALL data + permission filtering
 * to `loadDashboardData` — which gates every widget on `hasMenuAccess` and only
 * queries the ones the admin may see (ref 1-7). A super-admin sees every widget;
 * a limited admin sees only the widgets their grants cover.
 *
 * The idle auto-logout countdown is NOT rebuilt here: the Task 2C `IdleLogout`
 * is already mounted globally via `admin.components.actions`, so the quick-menu
 * widget only surfaces the profile summary + quick links + a Logout action and
 * notes the active idle timeout.
 */

type ViewProps = {
  initPageResult?: {
    req?: PayloadRequest
    cookies?: Map<string, string>
  }
  searchParams?: Record<string, string | string[] | undefined>
}

const DEFAULT_IDLE_MINUTES = 30

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

function idleTimeoutMinutes(): number {
  const raw = process.env.ADMIN_IDLE_TIMEOUT_MIN
  const parsed = raw !== undefined && raw.trim() !== '' ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_MINUTES
}

// ── Styles (inline + Payload theme vars + the U-CMS brand accent) ──
const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 1200, margin: '0 auto' }
const accent = branding.colors.primary
const card: React.CSSProperties = {
  background: 'var(--theme-elevation-0, #fff)',
  border: '1px solid var(--theme-elevation-100, #e5e5e5)',
  borderRadius: 8,
  padding: '1.1rem 1.25rem',
}
const cardTitle: React.CSSProperties = {
  margin: '0 0 .75rem',
  fontSize: '1rem',
  fontWeight: 700,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '.5rem',
}
const viewAll: React.CSSProperties = { fontSize: '.8rem', fontWeight: 400 }
const listRow: React.CSSProperties = {
  padding: '.4rem 0',
  borderBottom: '1px solid var(--theme-elevation-50, #f1f1f1)',
  fontSize: '.9rem',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '.75rem',
}
const empty: React.CSSProperties = {
  color: 'var(--theme-elevation-400, #999)',
  fontSize: '.9rem',
  padding: '.5rem 0',
}
const muted: React.CSSProperties = { color: 'var(--theme-elevation-500, #888)' }

function Gate({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div style={wrap}>
      <h1>{title}</h1>
      {children}
    </div>
  )
}

export async function AdminDashboardView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <Gate title={`${branding.productName} Dashboard`}>
        <p>You must be signed in to view the dashboard.</p>
      </Gate>
    )
  }

  // Resolve the sites this admin may operate (super → all; else assigned).
  const sitesWhere = isSuperUser(user) ? undefined : { id: { in: getAssignedTenantIds(user) } }
  const sites = await payload.find({
    collection: 'sites',
    where: sitesWhere as never,
    sort: 'name',
    depth: 0,
    limit: 100,
    pagination: false,
    overrideAccess: true,
  })
  const siteOptions = sites.docs as {
    id: string | number
    name?: unknown
    siteId?: unknown
    isAdminSite?: unknown
  }[]

  if (siteOptions.length === 0) {
    return (
      <Gate title={`${branding.productName} Dashboard`}>
        <p>No sites are assigned to your account. Ask an administrator to grant you a site.</p>
      </Gate>
    )
  }

  // Active site: ?site → the plugin's selected-tenant cookie → the admin site →
  // the first assigned site.
  const sp = props.searchParams ?? {}
  const cookieSite = props.initPageResult?.cookies?.get('payload-tenant')
  const adminSite = siteOptions.find((s) => s.isAdminSite === true)
  const requestedSite = firstParam(sp.site) ?? cookieSite
  const selectedSite =
    siteOptions.find((s) => String(s.id) === String(requestedSite))?.id ??
    adminSite?.id ??
    siteOptions[0]!.id
  const range: 'week' | 'month' = firstParam(sp.range) === 'month' ? 'month' : 'week'

  const data = await loadDashboardData({
    payload,
    req: req as PayloadRequest,
    tenantId: selectedSite,
    range,
  })

  const displayName =
    (typeof (user as { name?: unknown }).name === 'string' &&
      ((user as { name?: string }).name as string)) ||
    (typeof (user as { email?: unknown }).email === 'string'
      ? (user as { email?: string }).email!
      : 'Administrator')

  const show = (key: DashboardData['visibleWidgets'][number]): boolean =>
    data.visibleWidgets.includes(key)

  const q = (overrides: Record<string, string>): string =>
    new URLSearchParams({ site: String(selectedSite), range, ...overrides }).toString()

  return (
    <div style={wrap}>
      {/* Branded header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>
            <span style={{ color: accent }}>{branding.productName}</span> Dashboard
          </h1>
          <p style={{ ...muted, margin: '.25rem 0 0' }}>
            Welcome back, {displayName}. {branding.tagline}.
          </p>
        </div>

        {/* Site selector — only meaningful when >1 site is assigned. */}
        {siteOptions.length > 1 && (
          <form method="get" style={{ display: 'flex', gap: '.5rem', alignItems: 'end' }}>
            <input type="hidden" name="range" value={range} />
            <label>
              <div style={{ ...muted, fontSize: '.8rem' }}>Site</div>
              <select name="site" defaultValue={String(selectedSite)}>
                {siteOptions.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {typeof s.name === 'string' ? s.name : String(s.siteId ?? s.id)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Apply</button>
          </form>
        )}
      </div>

      {/* Today's metric cards */}
      {data.metricCards.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          {data.metricCards.map((m) => (
            <div key={m.key} style={{ ...card, borderTop: `3px solid ${accent}` }}>
              <div style={{ ...muted, fontSize: '.8rem' }}>{m.label}</div>
              <div style={{ fontSize: '1.9rem', fontWeight: 700, lineHeight: 1.1 }}>
                {m.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Widget grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        {show('traffic') && data.traffic && <TrafficWidget traffic={data.traffic} q={q} />}
        {show('adminNotices') && <NoticesWidget notices={data.notices ?? []} />}
        {show('notificationAreas') && <NotificationsWidget items={data.notifications ?? []} />}
        {show('recentPosts') && (
          <PostsWidget
            recent={data.recent ?? []}
            mostViewed={data.mostViewed ?? []}
            questions={data.questions ?? []}
          />
        )}
        {show('banners') && <BannersWidget banners={data.banners ?? []} />}
        {show('errorSummary') && data.errorSummary && <ErrorWidget summary={data.errorSummary} />}
        <QuickMenuWidget displayName={displayName} user={user} />
      </div>
    </div>
  )
}

// ── Widget: Traffic (week/month toggle + mini bar series) ──
function TrafficWidget({
  traffic,
  q,
}: {
  traffic: NonNullable<DashboardData['traffic']>
  q: (o: Record<string, string>) => string
}): React.ReactElement {
  const max = Math.max(1, ...traffic.series.map((s) => s.totalViews))
  return (
    <section style={card}>
      <h2 style={cardTitle}>
        <span>Traffic</span>
        <a style={viewAll} href="/admin/traffic-statistics">
          View all →
        </a>
      </h2>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem' }}>
        <a
          href={`?${q({ range: 'week' })}`}
          style={{ fontWeight: traffic.range === 'week' ? 700 : 400, fontSize: '.85rem' }}
        >
          Week
        </a>
        <a
          href={`?${q({ range: 'month' })}`}
          style={{ fontWeight: traffic.range === 'month' ? 700 : 400, fontSize: '.85rem' }}
        >
          Month
        </a>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>
            {traffic.totalViews.toLocaleString()}
          </div>
          <div style={{ ...muted, fontSize: '.75rem' }}>Page views</div>
        </div>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>
            {traffic.uniqueVisitors.toLocaleString()}
          </div>
          <div style={{ ...muted, fontSize: '.75rem' }}>Visitors</div>
        </div>
      </div>
      {traffic.series.length === 0 ? (
        <div style={empty}>No traffic recorded in this period.</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
          {traffic.series.map((s) => (
            <div
              key={s.period}
              title={`${s.period}: ${s.totalViews} views`}
              style={{
                flex: 1,
                minWidth: 2,
                height: `${Math.max(2, Math.round((s.totalViews / max) * 100))}%`,
                background: accent,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Widget: Administrator Notices ──
function NoticesWidget({
  notices,
}: {
  notices: NonNullable<DashboardData['notices']>
}): React.ReactElement {
  return (
    <section style={card}>
      <h2 style={cardTitle}>
        <span>Administrator Notices</span>
        <a style={viewAll} href="/admin/collections/adminNotices">
          View all →
        </a>
      </h2>
      {notices.length === 0 ? (
        <div style={empty}>No notices yet.</div>
      ) : (
        <div>
          {notices.map((n) => (
            <div key={String(n.id)} style={listRow}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.pinned && (
                  <span
                    style={{
                      color: accent,
                      fontWeight: 700,
                      fontSize: '.7rem',
                      marginRight: 6,
                    }}
                  >
                    PINNED
                  </span>
                )}
                {n.title}
              </span>
              <span style={{ ...muted, fontSize: '.75rem', whiteSpace: 'nowrap' }}>
                {n.createdAt ? n.createdAt.slice(0, 10) : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Widget: Notification areas / user notices ──
function NotificationsWidget({
  items,
}: {
  items: NonNullable<DashboardData['notifications']>
}): React.ReactElement {
  return (
    <section style={card}>
      <h2 style={cardTitle}>
        <span>Notification Areas</span>
        <a style={viewAll} href="/admin/collections/notificationAreas">
          View all →
        </a>
      </h2>
      {items.length === 0 ? (
        <div style={empty}>No notification-area items.</div>
      ) : (
        <div>
          {items.map((n) => (
            <div key={String(n.id)} style={listRow}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Widget: Recent posts + Most-viewed + Q&A ──
function PostList({
  title,
  rows,
  showViews,
}: {
  title: string
  rows: DashboardData['recent']
  showViews?: boolean
}): React.ReactElement {
  const list = rows ?? []
  return (
    <div style={{ marginBottom: '.75rem' }}>
      <div
        style={{ ...muted, fontSize: '.75rem', textTransform: 'uppercase', marginBottom: '.2rem' }}
      >
        {title}
      </div>
      {list.length === 0 ? (
        <div style={empty}>None yet.</div>
      ) : (
        list.map((p) => (
          <div key={String(p.id)} style={listRow}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.title}
            </span>
            <span style={{ ...muted, fontSize: '.75rem', whiteSpace: 'nowrap' }}>
              {showViews ? `${p.viewCount.toLocaleString()} views` : (p.boardName ?? '')}
            </span>
          </div>
        ))
      )}
    </div>
  )
}

function PostsWidget({
  recent,
  mostViewed,
  questions,
}: {
  recent: DashboardData['recent']
  mostViewed: DashboardData['mostViewed']
  questions: DashboardData['questions']
}): React.ReactElement {
  return (
    <section style={{ ...card, gridColumn: 'span 1' }}>
      <h2 style={cardTitle}>
        <span>Recent Posts &amp; Q&amp;A</span>
        <a style={viewAll} href="/admin/collections/posts">
          View all →
        </a>
      </h2>
      <PostList title="Recent" rows={recent} />
      <PostList title="Most viewed" rows={mostViewed} showViews />
      <PostList title="Recent questions" rows={questions} />
    </section>
  )
}

// ── Widget: Banner strip ──
function BannersWidget({
  banners,
}: {
  banners: NonNullable<DashboardData['banners']>
}): React.ReactElement {
  return (
    <section style={card}>
      <h2 style={cardTitle}>
        <span>Banners</span>
        <a style={viewAll} href="/admin/collections/banners">
          View all →
        </a>
      </h2>
      {banners.length === 0 ? (
        <div style={empty}>No active banners.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {banners.map((b) => (
            <div key={String(b.id)} style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
              {b.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.imageUrl}
                  alt={b.title}
                  style={{
                    width: 64,
                    height: 24,
                    objectFit: 'cover',
                    borderRadius: 3,
                    border: '1px solid var(--theme-elevation-100, #eee)',
                  }}
                />
              ) : (
                <span
                  style={{
                    width: 64,
                    height: 24,
                    borderRadius: 3,
                    background: 'var(--theme-elevation-100, #eee)',
                    display: 'inline-block',
                  }}
                />
              )}
              <span
                style={{
                  fontSize: '.9rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {b.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Widget: System error summary ──
function ErrorWidget({
  summary,
}: {
  summary: NonNullable<DashboardData['errorSummary']>
}): React.ReactElement {
  return (
    <section style={card}>
      <h2 style={cardTitle}>
        <span>System Errors</span>
        <a style={viewAll} href="/admin/error-statistics">
          View all →
        </a>
      </h2>
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <div>
          <div
            style={{
              fontSize: '1.9rem',
              fontWeight: 700,
              color: summary.todayCount > 0 ? branding.colors.error : undefined,
            }}
          >
            {summary.todayCount.toLocaleString()}
          </div>
          <div style={{ ...muted, fontSize: '.75rem' }}>Today</div>
        </div>
        <div>
          <div style={{ fontSize: '1.9rem', fontWeight: 700 }}>
            {summary.totalCount.toLocaleString()}
          </div>
          <div style={{ ...muted, fontSize: '.75rem' }}>Total logged</div>
        </div>
      </div>
    </section>
  )
}

// ── Widget: Quick menu (profile + idle-logout note + quick links) ──
function QuickMenuWidget({
  displayName,
  user,
}: {
  displayName: string
  user: unknown
}): React.ReactElement {
  const u = user as {
    department?: { name?: unknown } | null
    duties?: unknown
    profilePhoto?: { url?: unknown } | null
    email?: unknown
  }
  const deptName =
    u.department && typeof u.department === 'object' && typeof u.department.name === 'string'
      ? u.department.name
      : null
  const duties = typeof u.duties === 'string' ? u.duties : null
  const photoUrl =
    u.profilePhoto && typeof u.profilePhoto === 'object' && typeof u.profilePhoto.url === 'string'
      ? u.profilePhoto.url
      : null

  return (
    <section style={{ ...card, borderTop: `3px solid ${accent}` }}>
      <h2 style={cardTitle}>
        <span>Quick Menu</span>
      </h2>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', marginBottom: '.9rem' }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={displayName}
            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: accent,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.2rem',
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <div style={{ fontWeight: 700 }}>{displayName}</div>
          <div style={{ ...muted, fontSize: '.8rem' }}>
            {[deptName, duties].filter(Boolean).join(' · ') || 'Administrator'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.75rem' }}>
        <a href="/admin/account" style={quickLink}>
          My account
        </a>
        <a href="/admin/collections/users" style={quickLink}>
          Admins
        </a>
        <a href="/admin/access-history" style={quickLink}>
          Access history
        </a>
      </div>
      <div style={{ ...muted, fontSize: '.75rem' }}>
        Auto-logout after {idleTimeoutMinutes()} min idle · <a href="/admin/logout">Log out now</a>
      </div>
    </section>
  )
}

const quickLink: React.CSSProperties = {
  fontSize: '.8rem',
  padding: '.3rem .6rem',
  borderRadius: 4,
  border: `1px solid ${accent}`,
  color: accent,
  textDecoration: 'none',
}

export default AdminDashboardView
