import { createHmac } from 'crypto'
import type { Payload } from 'payload'
import { APIError } from 'payload'

import { toRelationId } from '../collections/utils'
import {
  isValidScore,
  summarizeSatisfaction,
  type SatisfactionSummary,
} from '../content/satisfaction'
import { normalizePath } from '../content/traffic'
import type { CurrentMember } from './member'

/**
 * Public-site SATISFACTION submit + summary seam (Task 4E; refs 2-18/2-19). The
 * security-critical counterpart to `src/site/survey.ts`: a rating row is built
 * ENTIRELY server-side and every trust-sensitive field is force-set from server
 * state (tenant / pageKey / menu / score / member / submittedAt / ipHash), then
 * field-access-locked, so an admin-panel/API write can never forge them.
 *
 * ## Privacy (Phase-6-ready)
 *
 * `ipHash` is an HMAC (server secret) over the tenant + page + principal — never
 * the raw IP — used only for a best-effort one-per-participant dedup, and it is
 * `read:false` on the collection so it never leaves the server.
 */

/** Thrown for a client-correctable submit problem; carries an HTTP status. */
export class SatisfactionError extends APIError {}

/** The server secret keying the dedup HMAC (dedicated var, else PAYLOAD_SECRET). */
function satisfactionSecret(): string {
  return process.env.SATISFACTION_SECRET || process.env.PAYLOAD_SECRET || ''
}

/**
 * A stable, identity-free dedup hash for one participant rating one page. The
 * principal is `m:<memberId>` for a logged-in member (so a member is deduped
 * without exposing who), else `ip:<trusted-ip>`, else `null` (best-effort — no
 * trustworthy key, so no over-blocking of legitimate anonymous raters).
 */
function computeRatingHash(
  tenantId: string | number,
  pageKey: string,
  principal: { memberId?: string | number | null; clientIp?: string | null },
): string | null {
  const p =
    principal.memberId != null
      ? `m:${principal.memberId}`
      : principal.clientIp
        ? `ip:${principal.clientIp}`
        : null
  if (p === null) {
    return null
  }
  return createHmac('sha256', satisfactionSecret())
    .update(`${tenantId}:${pageKey}:${p}`)
    .digest('hex')
}

/** A site-like shape carrying just the toggle the submit gates on. */
export type SatisfactionSite = { id: string | number; satisfactionEnabled?: boolean | null }

export type SatisfactionSubmitInput = {
  pageKey: string
  /** Optional owning menu id (the widget passes it for content pages). */
  menuId?: string | number | null
  score: number
}

export type SatisfactionSubmitContext = {
  member: CurrentMember
  /** A trustworthy client IP (already resolved through the trusted-proxy model), or null. */
  clientIp?: string | null
}

/**
 * Resolves a menu id that belongs to `tenantId`, or `null`. Prevents attaching a
 * cross-site (or non-existent) menu to a rating from a crafted submit.
 */
async function resolveSameSiteMenu(
  payload: Payload,
  tenantId: string | number,
  menuId: string | number,
): Promise<string | number | null> {
  const menu = await payload.findByID({
    collection: 'menus',
    id: menuId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!menu || String(toRelationId(menu.tenant)) !== String(tenantId)) {
    return null
  }
  return menu.id
}

/**
 * Records one satisfaction rating. Throws {@link SatisfactionError} for a
 * client-correctable problem (feature off, invalid score, already rated).
 * Returns the new rating id.
 */
export async function submitSatisfactionRating(
  payload: Payload,
  site: SatisfactionSite,
  input: SatisfactionSubmitInput,
  context: SatisfactionSubmitContext,
): Promise<{ id: string | number }> {
  if (site.satisfactionEnabled !== true) {
    throw new SatisfactionError('Satisfaction ratings are not enabled for this site.', 403)
  }
  if (!isValidScore(input.score)) {
    throw new SatisfactionError('Please choose a rating from 1 to 5.', 400)
  }
  const pageKey = normalizePath(input.pageKey)
  const tenantId = site.id

  const { member, clientIp } = context
  const memberOnSite = member != null && String(toRelationId(member.tenant)) === String(tenantId)
  const memberId = memberOnSite ? (member as NonNullable<CurrentMember>).id : null

  const menuId =
    input.menuId != null && Number.isInteger(Number(input.menuId))
      ? await resolveSameSiteMenu(payload, tenantId, input.menuId)
      : null

  const ipHash = computeRatingHash(tenantId, pageKey, { memberId, clientIp: clientIp ?? null })

  // Best-effort one-per-participant on this page: a member is deduped by id, an
  // anonymous rater by the hashed key (when a trustworthy one exists).
  if (memberId != null) {
    const existing = await payload.find({
      collection: 'satisfactionRatings',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { pageKey: { equals: pageKey } },
          { member: { equals: memberId } },
        ],
      },
      limit: 1,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      throw new SatisfactionError('You have already rated this page. Thank you.', 409)
    }
  } else if (ipHash != null) {
    const existing = await payload.find({
      collection: 'satisfactionRatings',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { pageKey: { equals: pageKey } },
          { ipHash: { equals: ipHash } },
        ],
      },
      limit: 1,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      throw new SatisfactionError('You have already rated this page. Thank you.', 409)
    }
  }

  const created = await payload.create({
    collection: 'satisfactionRatings',
    data: {
      tenant: tenantId,
      pageKey,
      ...(menuId != null ? { menu: menuId } : {}),
      score: input.score,
      member: memberId,
      submittedAt: new Date().toISOString(),
      ...(ipHash != null ? { ipHash } : {}),
    } as never,
    overrideAccess: true,
  })
  return { id: created.id }
}

/** Ratings for one page on a site, summarized (average + count + distribution). */
export async function loadSatisfactionSummary(
  payload: Payload,
  tenantId: string | number,
  pageKey: string,
): Promise<SatisfactionSummary> {
  const normalized = normalizePath(pageKey)
  const found = await payload.find({
    collection: 'satisfactionRatings',
    where: { and: [{ tenant: { equals: tenantId } }, { pageKey: { equals: normalized } }] },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  return summarizeSatisfaction(found.docs as { score?: number | null }[])
}

/** Whether the member (if any) has already rated this page — hides the form. */
export async function memberHasRated(
  payload: Payload,
  tenantId: string | number,
  pageKey: string,
  memberId: string | number,
): Promise<boolean> {
  const found = await payload.find({
    collection: 'satisfactionRatings',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { pageKey: { equals: normalizePath(pageKey) } },
        { member: { equals: memberId } },
      ],
    },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs.length > 0
}
