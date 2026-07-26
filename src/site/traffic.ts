import { createHmac } from 'crypto'
import type { Payload } from 'payload'

import {
  deviceTypeFromUserAgent,
  menuNumberFromPath,
  normalizePath,
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

/** Resolves the owning menu id for a `/page/{menuNumber}` path on a site, or null. */
async function resolveMenuForPath(
  payload: Payload,
  tenantId: string | number,
  path: string,
): Promise<string | number | null> {
  const menuNumber = menuNumberFromPath(path)
  if (menuNumber === null) {
    return null
  }
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
    const path = normalizePath(input.path)
    const menuId = await resolveMenuForPath(payload, input.tenantId, path)
    const created = await payload.create({
      collection: 'pageViews',
      data: {
        tenant: input.tenantId,
        path,
        ...(menuId != null ? { menu: menuId } : {}),
        deviceType: deviceTypeFromUserAgent(input.userAgent),
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
