import type { Payload } from 'payload'

/**
 * Password-policy management read-side (Task 6C Part 1; legacy ref 3-9 비밀번호
 * 작성 규칙). A VIEW over the EXISTING `passwordPolicies` collection (built in
 * Task 1D) — this task adds the MANAGEMENT surface: the current-live indicator
 * and the version history. It creates NO new capture; the collection's own
 * built-in Payload editor is still where versions are created/edited.
 *
 * ## The "most-recently-created active wins" rule (legacy ref 3-9)
 *
 * The system may hold many policy versions; deactivated versions are RETAINED
 * (versioned history). The single EFFECTIVE (live) policy is the most recently
 * created among those flagged `isActive` — see `resolveActivePasswordPolicy`.
 * This is the same rule `activePasswordPolicyText` (src/collections/
 * PasswordPolicies.ts) resolves via a `-createdAt` DB query; the pure helper
 * here replicates it in memory so it is unit-testable and so the management
 * view's "currently live" badge is computed deterministically.
 *
 * ## Re-activating a prior version (documented semantics)
 *
 * Because the live policy is the most-recently-CREATED active one, toggling an
 * OLD version's `isActive` back on does NOT make it live again if a newer
 * active version exists (the newer one still wins by createdAt). To make a
 * prior version's text live again you CREATE A NEW version carrying that text
 * and mark it active — the new version then becomes the most-recent active and
 * therefore the effective one. This mirrors the legacy behavior (createdAt is
 * immutable, so re-activation is modeled as a new version, not an in-place
 * edit) and is surfaced to operators in the management view.
 *
 * ## Code-enforces-rule vs policy-text-displays split (established in Task 1D)
 *
 * The rules actually ENFORCED (rejected) live in code
 * (`src/auth/validatePassword.ts`) and never read the DB. This collection holds
 * only the human-readable text DISPLAYED to users (e.g. the
 * `PasswordPolicyNotice` on the admin account-edit screen) plus the audit
 * history of rule versions. Editing `ruleText` changes what users are SHOWN,
 * not what is REJECTED.
 */

export const PASSWORD_POLICY_MENU_KEY = 'system.passwordPolicies'

/** Minimal shape the pure resolver needs — matches the `PasswordPolicy` type. */
export type PasswordPolicyLike = {
  id: number | string
  ruleText: string
  isActive?: boolean | null
  createdAt?: string | null
  createdBy?: string | null
}

/** A history row as rendered by the management view. */
export type PasswordPolicyHistoryRow = {
  id: number | string
  ruleText: string
  isActive: boolean
  createdAt: string | null
  createdBy: string | null
  /** True for the single most-recently-created active version (the live one). */
  isCurrentActive: boolean
}

export type PasswordPolicyHistory = {
  /** The single effective (live) policy, or null when none is active. */
  active: PasswordPolicyHistoryRow | null
  /** Every version, newest first. */
  rows: PasswordPolicyHistoryRow[]
}

function createdMillis(p: PasswordPolicyLike): number {
  const t = p.createdAt ? Date.parse(p.createdAt) : NaN
  return Number.isNaN(t) ? -Infinity : t
}

/** True iff `a` is more recent than `b` (createdAt desc, id desc as a stable tie-break). */
function isMoreRecent(a: PasswordPolicyLike, b: PasswordPolicyLike): boolean {
  const ta = createdMillis(a)
  const tb = createdMillis(b)
  if (ta !== tb) {
    return ta > tb
  }
  return Number(a.id) > Number(b.id)
}

/**
 * The effective (live) password policy = the most-recently-created among those
 * flagged `isActive`, or `null` when none is active (legacy ref 3-9). Pure and
 * side-effect-free so it can be unit-tested exhaustively without a DB.
 */
export function resolveActivePasswordPolicy<T extends PasswordPolicyLike>(policies: T[]): T | null {
  let winner: T | null = null
  for (const p of policies) {
    if (p.isActive !== true) {
      continue
    }
    if (winner === null || isMoreRecent(p, winner)) {
      winner = p
    }
  }
  return winner
}

function toRow(p: PasswordPolicyLike, activeId: number | string | null): PasswordPolicyHistoryRow {
  return {
    id: p.id,
    ruleText: p.ruleText,
    isActive: p.isActive === true,
    createdAt: p.createdAt ?? null,
    createdBy: p.createdBy ?? null,
    isCurrentActive: activeId !== null && p.id === activeId,
  }
}

/**
 * Loads the full version history (newest first) plus the single live policy,
 * for the management view. Reads with `overrideAccess: true` because the view's
 * own `hasMenuAccess(system.passwordPolicies)` gate already authorized the
 * caller (same pattern as `loadAccessHistory`).
 */
export async function loadPasswordPolicyHistory(payload: Payload): Promise<PasswordPolicyHistory> {
  const found = await payload.find({
    collection: 'passwordPolicies',
    sort: '-createdAt',
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  const policies = found.docs as unknown as PasswordPolicyLike[]
  const active = resolveActivePasswordPolicy(policies)
  const activeId = active ? active.id : null
  return {
    active: active ? toRow(active, activeId) : null,
    rows: policies.map((p) => toRow(p, activeId)),
  }
}
