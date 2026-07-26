import type { Payload, PayloadRequest } from 'payload'

import { menuNumberFromPath } from '../content/traffic'
import { buildDailyRollup, type RawViewLike } from '../content/trafficStats'

/**
 * Traffic aggregation + retention runtime (Task 5A; TODO 5.1). Turns raw
 * `pageViews` rows into the compact per-(site, day) `trafficDaily` rollups the
 * statistics tabs read, and prunes raw events past their retention window once
 * they are safely aggregated.
 *
 * ## Jobs-queue vs script (decision)
 *
 * Payload 3.86 DOES ship a jobs queue (`config.jobs` + tasks + `autoRun` crons),
 * but its cron `autoRun` is explicitly discouraged on serverless/Vercel (this
 * app's target) and it would add a jobs COLLECTION + migration + a runner. The
 * established pattern in this repo is a cron-ready idempotent script
 * (`scripts/mark-dormant.ts` → `dormancy:sweep`). So the aggregation is exposed
 * the same way — a pure, payload-driven function here, driven by
 * `scripts/aggregate-traffic.ts` (`pnpm aggregate:traffic`), schedulable by the
 * host's cron. Promoting this to a native job later is a drop-in: the job's
 * handler just calls {@link aggregateAllTenantsForDate} + {@link pruneAgedPageViews}.
 * Everything here takes an explicit `payload`, so either driver works.
 */

/** Default retention window (days) for raw page views when the env is unset/invalid. */
export const DEFAULT_PAGEVIEW_RETENTION_DAYS = 90

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback
  }
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/** Resolves the raw-pageview retention window (days) from `PAGEVIEW_RETENTION_DAYS`. */
export function getPageViewRetentionDays(): number {
  return parsePositiveInt(process.env.PAGEVIEW_RETENTION_DAYS, DEFAULT_PAGEVIEW_RETENTION_DAYS)
}

/** The `YYYY-MM-DD` UTC day of a Date. */
export function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Yesterday (UTC) as `YYYY-MM-DD` — the D-1 default aggregation target. */
export function yesterdayUtc(now: Date = new Date()): string {
  return utcDayString(new Date(now.getTime() - 86_400_000))
}

/** ISO [start, end) bounds of a UTC calendar day given its `YYYY-MM-DD` string. */
export function utcDayBounds(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00.000Z`)
  const end = new Date(start.getTime() + 86_400_000)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Maps a raw `pageViews` doc to the privacy-safe shape the rollup consumes. */
function toRawView(doc: Record<string, unknown>): RawViewLike {
  const path = typeof doc.path === 'string' ? doc.path : null
  return {
    path,
    menuNumber: path ? menuNumberFromPath(path) : null,
    osFamily: typeof doc.osFamily === 'string' ? doc.osFamily : null,
    browserFamily: typeof doc.browserFamily === 'string' ? doc.browserFamily : null,
    deviceType: typeof doc.deviceType === 'string' ? doc.deviceType : null,
    sessionKey: typeof doc.sessionKey === 'string' ? doc.sessionKey : null,
  }
}

/** Reads a site's raw page views for one UTC day (override — needs the read:false sessionKey). */
async function loadDayViews(
  payload: Payload,
  tenantId: string | number,
  date: string,
  req?: PayloadRequest,
): Promise<RawViewLike[]> {
  const { start, end } = utcDayBounds(date)
  const found = await payload.find({
    collection: 'pageViews',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { ts: { greater_than_equal: start } },
        { ts: { less_than: end } },
      ],
    },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return found.docs.map((d) => toRawView(d as unknown as Record<string, unknown>))
}

export type AggregateResult = {
  tenantId: string | number
  date: string
  totalViews: number
  uniqueVisitors: number
  /** The trafficDaily doc id written (created or updated). */
  rollupId: string | number
}

/**
 * Aggregates ONE (site, day): reads the raw views, builds the compact rollup,
 * and UPSERTs the `trafficDaily` doc for `(tenant, date)`. IDEMPOTENT — re-running
 * the same date overwrites the existing rollup (never double-counts), because it
 * re-derives every figure from the raw rows and writes to the one unique
 * `(tenant, date)` doc. Runs even for a zero-view day (writes an all-zero
 * rollup) so "aggregated" is unambiguous for the retention guard.
 */
export async function aggregateTrafficForDate(
  payload: Payload,
  args: { tenantId: string | number; date: string; req?: PayloadRequest },
): Promise<AggregateResult> {
  const { tenantId, date, req } = args
  const views = await loadDayViews(payload, tenantId, date, req)
  const rollup = buildDailyRollup(views, date)

  const data = {
    tenant: tenantId,
    date,
    totalViews: rollup.totalViews,
    uniqueVisitors: rollup.uniqueVisitors,
    byPath: rollup.byPath,
    byOs: rollup.byOs,
    byBrowser: rollup.byBrowser,
    byDevice: rollup.byDevice,
  }

  const existing = await payload.find({
    collection: 'trafficDaily',
    where: { and: [{ tenant: { equals: tenantId } }, { date: { equals: date } }] },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const current = existing.docs[0]
  const written = current
    ? await payload.update({
        collection: 'trafficDaily',
        id: current.id,
        data: data as never,
        overrideAccess: true,
        req,
      })
    : await payload.create({
        collection: 'trafficDaily',
        data: data as never,
        overrideAccess: true,
        req,
      })

  return {
    tenantId,
    date,
    totalViews: rollup.totalViews,
    uniqueVisitors: rollup.uniqueVisitors,
    rollupId: written.id,
  }
}

/** Aggregates the given day for EVERY site (tenant). Idempotent per site. */
export async function aggregateAllTenantsForDate(
  payload: Payload,
  date: string,
  req?: PayloadRequest,
): Promise<AggregateResult[]> {
  const sites = await payload.find({
    collection: 'sites',
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const results: AggregateResult[] = []
  for (const site of sites.docs) {
    results.push(await aggregateTrafficForDate(payload, { tenantId: site.id, date, req }))
  }
  return results
}

export type PruneResult = {
  /** Raw page views deleted. */
  deleted: number
  /** (tenant, day) pairs skipped because they were NOT yet aggregated (kept for safety). */
  skippedUnaggregatedDays: number
}

/**
 * Prunes raw `pageViews` older than the retention window — but ONLY for days
 * that have already been aggregated into `trafficDaily`, so a not-yet-aggregated
 * day is NEVER destroyed (its rollup would be lost forever). Idempotent: once a
 * day's raw rows are gone a re-run finds nothing new to delete. The aggregates
 * are the long-lived record; raw events are ephemeral (privacy + storage).
 *
 * Safety rule: for each distinct (tenant, day) among the aged raw rows, delete
 * that day's rows ONLY when a `trafficDaily` rollup exists for `(tenant, day)`;
 * otherwise skip it (a later aggregation run will roll it up, and a subsequent
 * prune will then clear it).
 *
 * `maxScan` bounds how many aged rows one run inspects (steady-state daily cron
 * leaves only ~1 day of backlog; the cap protects a first run over a large
 * backlog — re-run to drain the rest).
 */
export async function pruneAgedPageViews(
  payload: Payload,
  args: { retentionDays?: number; now?: Date; maxScan?: number; req?: PayloadRequest } = {},
): Promise<PruneResult> {
  const retentionDays = args.retentionDays ?? getPageViewRetentionDays()
  const now = args.now ?? new Date()
  const maxScan = args.maxScan ?? 50_000
  const req = args.req

  // Cutoff = start of the day `retentionDays` ago (UTC). Anything strictly before
  // this instant is "aged". Using the day boundary keeps whole-day rollups intact.
  const cutoffDay = utcDayString(new Date(now.getTime() - retentionDays * 86_400_000))
  const cutoff = utcDayBounds(cutoffDay).start

  const aged = await payload.find({
    collection: 'pageViews',
    where: { ts: { less_than: cutoff } },
    depth: 0,
    limit: maxScan,
    pagination: false,
    overrideAccess: true,
    req,
  })

  // Distinct (tenant, day) among the aged rows.
  const dayKeys = new Map<string, { tenantId: string | number; day: string }>()
  for (const doc of aged.docs) {
    const tenantRel = (doc as { tenant?: unknown }).tenant
    const tenantId =
      tenantRel && typeof tenantRel === 'object'
        ? (tenantRel as { id?: string | number }).id
        : (tenantRel as string | number | undefined)
    const ts = (doc as { ts?: unknown }).ts
    if (tenantId === undefined || typeof ts !== 'string') {
      continue
    }
    const day = ts.slice(0, 10)
    dayKeys.set(`${tenantId}|${day}`, { tenantId, day })
  }

  let deleted = 0
  let skipped = 0
  for (const { tenantId, day } of dayKeys.values()) {
    const rollup = await payload.find({
      collection: 'trafficDaily',
      where: { and: [{ tenant: { equals: tenantId } }, { date: { equals: day } }] },
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
      req,
    })
    if (rollup.docs.length === 0) {
      skipped += 1
      continue
    }
    const { start, end } = utcDayBounds(day)
    const res = await payload.delete({
      collection: 'pageViews',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { ts: { greater_than_equal: start } },
          { ts: { less_than: end } },
        ],
      },
      overrideAccess: true,
      req,
    })
    deleted += Array.isArray(res.docs) ? res.docs.length : 0
  }

  payload.logger?.info?.(
    `[traffic] pruned ${deleted} aged page view(s); skipped ${skipped} un-aggregated day(s).`,
  )
  return { deleted, skippedUnaggregatedDays: skipped }
}
