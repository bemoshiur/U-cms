import type { Payload } from 'payload'

import { ipMatches } from './ipMatch'

/**
 * Default-deny admin IP access decision (Task 2C; feature-inventory ref 1-21).
 *
 * ## Bootstrap safety (a DOCUMENTED, TESTED decision)
 *
 * Legacy U-CMS is default-deny: only allowlisted IPs may reach the admin. Taken
 * literally, a fresh install — which has **no rules yet** — would deny
 * everyone, bricking the very first login. So the single, deliberate exception
 * is: **if the admin site has NO rule documents at all, access is OPEN.** An
 * empty allowlist can never lock anyone out. The moment an operator adds their
 * first rule, default-deny arms and every non-matching IP is refused. This is
 * covered by tests (`no-rules-bootstrap`), and the seed installs an active `*`
 * allow so even a seeded install stays reachable until the operator narrows it.
 *
 * ## Decision order (once rules exist)
 *
 *  1. Restrict to rules that are `isActive` AND whose `[validFrom, validTo]`
 *     window contains `now` — so an expired or not-yet-valid rule simply stops
 *     counting at match time (no cron needed; ref 1-21 validity windows).
 *  2. Any matching `block` rule → DENY (block wins over allow).
 *  3. Else any matching `allow` rule → ALLOW.
 *  4. Else → DENY (default-deny).
 *
 * An empty/undefined `clientIp` (no proxy forwarded the address) matches only a
 * bare `*` rule (see `ipMatches`) — so it is covered by a `*` allow but by no
 * specific allow, and otherwise falls through to default-deny.
 */

export type IpAccessDecision = {
  allowed: boolean
  reason: 'no-rules-bootstrap' | 'blocked-by-rule' | 'allowed-by-rule' | 'default-deny'
  /**
   * Whether the allowlist is **armed** — i.e. there is at least one active,
   * in-window rule for this site right now. The enforcement layer needs this
   * (distinct from `allowed`) to decide what to do when it has NO trustworthy
   * client IP: an unarmed allowlist never blocks (bootstrap net), while an
   * armed one with no trustworthy IP fails closed in production. An empty
   * ruleset, or one whose rules are all inactive/expired, is unarmed.
   */
  armed: boolean
  /**
   * Whether the active ruleset is **effectively unrestricted** — i.e. it grants
   * EVERY IP anyway, so it can never actually deny anyone. True exactly when
   * there are NO active `block` rules AND at least one active bare-`*` `allow`
   * rule (the seeded bootstrap default). The enforcement layer (Task TR2 Part 4)
   * uses this to AVOID the production fail-closed 503 when it has no trustworthy
   * client IP: an all-allowing list grants nothing extra by admitting an
   * unresolved IP, so bricking a demo over it is pure downside. A single `block`
   * rule, or a specific (non-`*`) allowlist with no `*`, makes this FALSE, so a
   * genuinely-restrictive ruleset still fails closed. Unarmed/empty rulesets are
   * reported as `true` here (they too deny no one), but the enforcement layer
   * already treats unarmed as bootstrap-open before consulting this.
   */
  unrestricted: boolean
}

type AdminIpRuleRow = {
  ipAddress?: string | null
  accessType?: string | null
  isActive?: boolean | null
  validFrom?: string | null
  validTo?: string | null
}

function isWithinWindow(row: AdminIpRuleRow, nowMs: number): boolean {
  if (!row.isActive) {
    return false
  }
  const from = row.validFrom ? new Date(row.validFrom).getTime() : NaN
  const to = row.validTo ? new Date(row.validTo).getTime() : NaN
  return Number.isFinite(from) && Number.isFinite(to) && from <= nowMs && nowMs <= to
}

export async function isIpAllowedForAdmin(
  payload: Payload,
  clientIp: string | undefined,
  siteId: number | string,
  now: Date = new Date(),
): Promise<IpAccessDecision> {
  const all = await payload.find({
    collection: 'adminIpRules',
    where: { siteId: { equals: siteId } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  // Empty allowlist → open (bootstrap safety, documented above).
  if (all.docs.length === 0) {
    return { allowed: true, reason: 'no-rules-bootstrap', armed: false, unrestricted: true }
  }

  const nowMs = now.getTime()
  const active = (all.docs as AdminIpRuleRow[]).filter((r) => isWithinWindow(r, nowMs))
  const armed = active.length > 0

  // "Effectively unrestricted": no active block rule (a block means the operator
  // is genuinely restricting — an unresolved IP could be an attempt to evade it,
  // so we must NOT treat that as open) AND at least one active bare-`*` allow
  // rule (which grants every IP anyway, including an unresolved one). A specific
  // allowlist with no `*` is NOT unrestricted (it denies non-matching IPs).
  const hasActiveBlock = active.some((r) => r.accessType === 'block')
  const hasStarAllow = active.some((r) => r.accessType === 'allow' && r.ipAddress === '*')
  const unrestricted = !hasActiveBlock && hasStarAllow

  // block wins over allow.
  for (const r of active) {
    if (r.accessType === 'block' && r.ipAddress && ipMatches(clientIp, r.ipAddress)) {
      return { allowed: false, reason: 'blocked-by-rule', armed, unrestricted }
    }
  }
  for (const r of active) {
    if (r.accessType === 'allow' && r.ipAddress && ipMatches(clientIp, r.ipAddress)) {
      return { allowed: true, reason: 'allowed-by-rule', armed, unrestricted }
    }
  }

  // Rules exist but none matched (or all are inactive/expired → unarmed): under
  // default-deny a trusted client is blocked; an unarmed set (armed === false)
  // is treated as bootstrap-open by the enforcement layer.
  return { allowed: false, reason: 'default-deny', armed, unrestricted }
}
