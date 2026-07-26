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
    where: { and: [{ tenant: { equals: tenantId } }, { bbsId: { equals: bbsId } }] },
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
 * Records one page view. Best-effort — never throws to the caller (a capture
 * failure must not break navigation); the beacon route ignores the result.
 * Returns the new row id, or `null` on any failure.
 */
export async function recordPageView(
  payload: Payload,
  input: PageViewInput,
  now: Date = new Date(),
): Promise<string | number | null> {
  try {
    const normalized = normalizePath(input.path)
    const { path, menuId } = await resolveCanonicalPath(payload, input.tenantId, normalized)
    const created = await payload.create({
      collection: 'pageViews',
      data: {
        tenant: input.tenantId,
        path,
        ...(menuId != null ? { menu: menuId } : {}),
        deviceType: deviceTypeFromUserAgent(input.userAgent),
        osFamily: osFamilyFromUserAgent(input.userAgent),
        browserFamily: browserFamilyFromUserAgent(input.userAgent),
        referrerHost: referrerHost(input.referrer),
        sessionKey: computeSessionKey(input.clientIp ?? null, input.userAgent ?? null, now),
        ts: now.toISOString(),
      } as never,
      overrideAccess: true,
    })
    return created.id
  } catch (err) {
    payload.logger?.warn?.(`[traffic] page-view capture failed: ${(err as Error)?.message}`)
    return null
  }
}
