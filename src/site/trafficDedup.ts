import { createHmac } from 'crypto'

/**
 * Per-(session, path) view dedup for the `/track` beacon (Task 5A Part 0 — the
 * carried Phase-4 review D6). The dedicated higher rate limit
 * (`enforceTrackRateLimit`) only caps gross flooding; this is the finer control
 * the brief requires: within a short window, ONE view per (session, path) is
 * recorded, so a single client re-firing the same page (SPA re-renders, refresh
 * spam, a tight reload loop) cannot inflate that page's PV / unique-visitor
 * counts.
 *
 * ## Design — a TTL set with an injectable clock
 *
 * A process-local `Map<dedupKey, expiresAt>`. `shouldRecord(key)` returns `true`
 * the FIRST time a key is seen in its window (and arms the window), `false`
 * while that window is live. Mirrors the {@link RateLimiter} choice: a tiny,
 * clock-injectable structure that unit-tests exhaustively without timers.
 *
 * ## Per-instance caveat (deliberate, documented)
 *
 * The store is in-memory, so dedup is PER RUNNING INSTANCE — behind N instances
 * a determined client could record up to N duplicates per window. A shared store
 * (Redis) is the SAME Phase-7 concern as the rate limiter and the session-hash;
 * intentionally not built here. The dedup key is derived from the SAME
 * trusted-proxy client signal + UA + day as the capture's session hash, so it
 * inherits that spoof-resistance and daily rotation and carries NO stored PII.
 */

/** Default dedup window (minutes) when `TRACK_DEDUP_WINDOW_MIN` is unset/invalid. */
export const DEFAULT_TRACK_DEDUP_WINDOW_MIN = 10

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback
  }
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/** Resolves the dedup window (ms) from env. */
export function getTrackDedupWindowMs(): number {
  return (
    parsePositiveInt(process.env.TRACK_DEDUP_WINDOW_MIN, DEFAULT_TRACK_DEDUP_WINDOW_MIN) * 60_000
  )
}

/**
 * A daily-rotating, salted dedup key for a (client, path) pair. It is a one-way
 * HMAC (like the capture session hash) so it stores NO PII even in memory, and
 * it folds in the calendar day so windows never span a day boundary. When no
 * trustworthy client IP exists, the UA still keys it (coarser — matching the
 * capture's `anon` fallback).
 */
export function buildTrackDedupKey(
  clientIp: string | null | undefined,
  userAgent: string | null | undefined,
  canonicalPath: string,
  now: Date = new Date(),
): string {
  const secret = process.env.TRAFFIC_SECRET || process.env.PAYLOAD_SECRET || ''
  const day = now.toISOString().slice(0, 10)
  const material = `${clientIp ?? 'anon'}:${userAgent ?? ''}:${canonicalPath}:${day}`
  return createHmac('sha256', secret).update(material).digest('hex')
}

/** In-memory TTL set — first-seen-in-window returns true; a live window returns false. */
export class TrafficDedup {
  private readonly seen = new Map<string, number>()
  private nextSweepAt = 0

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Records `key`; returns true only if this is the first sighting in its window. */
  shouldRecord(key: string): boolean {
    const now = this.now()
    this.maybeSweep(now)
    const expiresAt = this.seen.get(key)
    if (expiresAt !== undefined && now < expiresAt) {
      return false
    }
    this.seen.set(key, now + this.windowMs)
    return true
  }

  /** Drops expired entries so the map can't grow unbounded (amortized, once/window). */
  private maybeSweep(now: number): void {
    if (now < this.nextSweepAt) {
      return
    }
    this.nextSweepAt = now + this.windowMs
    for (const [key, expiresAt] of this.seen) {
      if (now >= expiresAt) {
        this.seen.delete(key)
      }
    }
  }

  /** Test/ops helper: clears all state. */
  reset(): void {
    this.seen.clear()
    this.nextSweepAt = 0
  }

  /** Live entry count (tests/introspection). */
  get size(): number {
    return this.seen.size
  }
}

let singleton: TrafficDedup | null = null

/** The process-wide `/track` dedup (lazily built from env). */
export function getTrafficDedup(): TrafficDedup {
  if (!singleton) {
    singleton = new TrafficDedup(getTrackDedupWindowMs())
  }
  return singleton
}

/** Rebuilds the dedup from the CURRENT env and drops all state (tests/ops). */
export function resetTrafficDedup(): void {
  singleton = new TrafficDedup(getTrackDedupWindowMs())
}
