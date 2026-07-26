import { createHmac } from 'crypto'
import type { Payload } from 'payload'

import {
  browserFamilyFromUserAgent,
  classifyPath,
  deviceTypeFromUserAgent,
  normalizePath,
  osFamilyFromUserAgent,
  OTHER_PATH_BUCKET,
  referrerHost,
} from '../content/traffic'
import { buildTrackDedupKey, getTrafficDedup } from './trafficDedup'

/**
 * Public traffic capture seam (Task 4E; TODO 4.9, feeds Phase 5). Records ONE
 * page view with NO PII (see `src/content/traffic.ts` + `PageViews.ts` for the
 * privacy posture). Every field is derived server-side and force-written via
 * `overrideAccess`; the raw IP is never stored — it only feeds a rotating salted
 * `sessionKey` hash.
 *
 * Called by the `/track` beacon route (a `(frontend)` route handler, so never
 * `/api/*` → never subject to the admin IP guard). Kept cheap: a single insert
 * plus (only for `/page/{menuNumber}`) one menu lookup for the per-menu stats
 * dimension.
 */

/** The server secret keying the sessionKey HMAC (dedicated var, else PAYLOAD_SECRET). */
function trafficSecret(): string {
  return process.env.TRAFFIC_SECRET || process.env.PAYLOAD_SECRET || ''
}

/**
 * A rotating, salted session hash from the coarse IP + UA + CALENDAR DAY, so it
 * cannot be reversed to an IP and it rotates daily (a visitor is not trackable
 * across days). Returns a stable hex string; when there is no trustworthy IP the
 * key is still derived (from UA + day) — coarser, never PII.
 */
function computeSessionKey(
  clientIp: string | null | undefined,
  userAgent: string | null | undefined,
  now: Date,
): string {
  const day = now.toISOString().slice(0, 10) // YYYY-MM-DD — daily rotation
  const material = `${clientIp ?? 'anon'}:${userAgent ?? ''}:${day}`
  return createHmac('sha256', trafficSecret()).update(material).digest('hex')
}

/** Looks up the owning menu id for a `/page/{menuNumber}` on a site, or null. */
async function findMenuByNumber(
  payload: Payload,
  tenantId: string | number,
  menuNumber: number,
): Promise<string | number | null> {
  const found = await payload.find({
    collection: 'menus',
    where: { and: [{ tenant: { equals: tenantId } }, { menuNumber: { equals: menuNumber } }] },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.id ?? null
}

/** True iff a board with `bbsId` exists on the site (bounds `/board/{bbsId}`). */
async function boardExists(
  payload: Payload,
  tenantId: string | number,
  bbsId: string,
): Promise<boolean> {
  const found = await payload.find({
    collection: 'boards',
    // Exclude §3 security-doc boards (Task 6D): they are never public, so their
    // enumerable bbsId must never classify a traffic URL as a public board hit
    // (consistent with the C1 public-read posture — this fn only canonicalizes).
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { bbsId: { equals: bbsId } },
        { securityDoc: { not_equals: true } },
      ],
    },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs.length > 0
}

/**
 * Resolves the CANONICAL stored path + owning menu id for a captured path (Task
 * 5A Part 0 / D6). The path is classified against the site's REAL routes: a
 * concrete `/page/{n}` / `/board/{bbsId}` is confirmed to exist on THIS site
 * (else bucketed), id-bearing routes are template-collapsed, and anything
 * unknown collapses to {@link OTHER_PATH_BUCKET} — so an attacker-chosen path can
 * never mint a distinct fake page in the (bounded) stats/log.
 */
async function resolveCanonicalPath(
  payload: Payload,
  tenantId: string | number,
  normalized: string,
): Promise<{ path: string; menuId: string | number | null }> {
  const classified = classifyPath(normalized)
  switch (classified.kind) {
    case 'known':
      return { path: classified.path, menuId: null }
    case 'page': {
      const menuId = await findMenuByNumber(payload, tenantId, classified.menuNumber)
      return menuId != null
        ? { path: classified.path, menuId }
        : { path: OTHER_PATH_BUCKET, menuId: null }
    }
    case 'board': {
      const exists = await boardExists(payload, tenantId, classified.bbsId)
      return exists
        ? { path: classified.path, menuId: null }
        : { path: OTHER_PATH_BUCKET, menuId: null }
    }
    default:
      return { path: OTHER_PATH_BUCKET, menuId: null }
  }
}

export type PageViewInput = {
  tenantId: string | number
  path: string
  userAgent?: string | null
  referrer?: string | null
  /** A trustworthy client IP (resolved through the trusted-proxy model), or null. */
  clientIp?: string | null
}

/**
 * Inserts one page view for an ALREADY-CANONICAL path (no re-classification). The
 * single writer both `recordPageView` (raw path → canonicalize → here) and the
 * `/track` `captureTrackedView` (canonicalize → dedup → here) funnel through, so
 * the stored shape is defined in exactly one place.
 */
async function insertCanonicalView(
  payload: Payload,
  args: {
    tenantId: string | number
    canonicalPath: string
    menuId: string | number | null
    userAgent?: string | null
    referrer?: string | null
    clientIp?: string | null
  },
  now: Date,
): Promise<string | number> {
  const created = await payload.create({
    collection: 'pageViews',
    data: {
      tenant: args.tenantId,
      path: args.canonicalPath,
      ...(args.menuId != null ? { menu: args.menuId } : {}),
      deviceType: deviceTypeFromUserAgent(args.userAgent),
      osFamily: osFamilyFromUserAgent(args.userAgent),
      browserFamily: browserFamilyFromUserAgent(args.userAgent),
      referrerHost: referrerHost(args.referrer),
      sessionKey: computeSessionKey(args.clientIp ?? null, args.userAgent ?? null, now),
      ts: now.toISOString(),
    } as never,
    overrideAccess: true,
  })
  return created.id
}

/**
 * Records one page view (canonicalizing the raw path first). Best-effort — never
 * throws to the caller; returns the new row id, or `null` on any failure. NO
 * dedup here: this is the direct capture entry point for seeds/tests/other
 * callers that intend every call to write a row. The dedup that protects the
 * public `/track` beacon lives in {@link captureTrackedView}.
 */
export async function recordPageView(
  payload: Payload,
  input: PageViewInput,
  now: Date = new Date(),
): Promise<string | number | null> {
  try {
    const normalized = normalizePath(input.path)
    const { path, menuId } = await resolveCanonicalPath(payload, input.tenantId, normalized)
    return await insertCanonicalView(
      payload,
      {
        tenantId: input.tenantId,
        canonicalPath: path,
        menuId,
        userAgent: input.userAgent,
        referrer: input.referrer,
        clientIp: input.clientIp,
      },
      now,
    )
  } catch (err) {
    payload.logger?.warn?.(`[traffic] page-view capture failed: ${(err as Error)?.message}`)
    return null
  }
}

/**
 * The `/track` beacon capture (Task 5A Part 0 / D6). Canonicalizes the raw path,
 * then applies per-(session, path) DEDUP keyed off the CANONICAL/stored bucket —
 * NOT the raw path. This is the fix for the D6 bypass: because the classification
 * regexes collapse trailing garbage (`/page/7/x1`, `/page/7/x2`, … all → the
 * stored `/page/7`), keying dedup on the raw path let a forged-body flood mint a
 * distinct dedup key per request while every row landed on the SAME real page —
 * inflating its count. Keying on the canonical bucket makes those variants share
 * one dedup key, so a client can record at most one view of a given page per
 * window. Records at most one row; returns the id, `null` if deduped/failed.
 * Best-effort — never throws (navigation must not break).
 */
export async function captureTrackedView(
  payload: Payload,
  input: PageViewInput,
  now: Date = new Date(),
): Promise<string | number | null> {
  try {
    const normalized = normalizePath(input.path)
    const { path, menuId } = await resolveCanonicalPath(payload, input.tenantId, normalized)
    // Dedup key off the CANONICAL bucket (the value that gets stored), so
    // trailing-garbage variants of one real page collapse to a single key.
    const dedupKey = buildTrackDedupKey(input.clientIp ?? null, input.userAgent ?? null, path, now)
    if (!getTrafficDedup().shouldRecord(dedupKey)) {
      return null
    }
    return await insertCanonicalView(
      payload,
      {
        tenantId: input.tenantId,
        canonicalPath: path,
        menuId,
        userAgent: input.userAgent,
        referrer: input.referrer,
        clientIp: input.clientIp,
      },
      now,
    )
  } catch (err) {
    payload.logger?.warn?.(`[traffic] tracked-view capture failed: ${(err as Error)?.message}`)
    return null
  }
}
