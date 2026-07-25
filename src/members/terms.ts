/**
 * Member terms-consent snapshot (Task 4B Part 3; refs 2-13 회원가입 약관동의).
 *
 * ## The T4E seam (documented, deliberate)
 *
 * Legacy U-CMS stored VERSIONED terms documents (5 categories, one active per
 * category) that a member had to agree to at sign-up, and retained the accepted
 * version as consent evidence. That versioned `termsDocuments` collection is a
 * PHASE-4 T4E deliverable and does NOT exist yet. Rather than block member
 * sign-up on it, this module ships a stable, forward-compatible SNAPSHOT: at
 * sign-up we record, per accepted category, `{ category, version, agreedAt }`
 * on the member (`members.termsConsents`, field-access-locked so a member can
 * never rewrite their own consent history — see Members.ts).
 *
 * `MEMBER_TERMS_VERSION` is the single placeholder version identifier the
 * snapshot stores today. When T4E lands the real versioned `termsDocuments`,
 * the sign-up flow reads the active version id PER CATEGORY from that collection
 * and stores it here instead of this constant — every consumer already goes
 * through {@link buildTermsConsents}, so only its body changes. Existing snapshots
 * keep whatever version string they captured (immutable evidence), so no data
 * migration of historical consent is needed.
 */

/** A terms category a member consents to at sign-up. */
export type TermsCategory = 'service' | 'privacy'

/**
 * The terms categories a member MUST agree to at sign-up (the two mandatory
 * legacy agreements — service terms + privacy policy). `marketing` is a separate
 * OPTIONAL opt-in tracked as `members.marketingConsent`, not a required term.
 */
export const REQUIRED_TERMS_CATEGORIES: readonly TermsCategory[] = ['service', 'privacy']

/**
 * Placeholder active-terms version stored in each consent snapshot until T4E's
 * versioned `termsDocuments` supplies real per-category version ids. Bump this
 * (or replace the mechanism in {@link buildTermsConsents}) when real terms land.
 */
export const MEMBER_TERMS_VERSION = 'seam-2026-07-25'

/** One stored consent record (mirrors the `members.termsConsents` array row). */
export type TermsConsentRecord = {
  category: TermsCategory
  version: string
  agreedAt: string
}

/**
 * Builds the consent snapshot to persist on the member for the required
 * categories, stamping the current active version + an `agreedAt` timestamp.
 * `now` is injectable for deterministic tests. This is the ONE place the
 * version identifier is resolved, so T4E swaps the constant for a real
 * per-category `termsDocuments` lookup here and nothing else changes.
 */
export function buildTermsConsents(now: Date = new Date()): TermsConsentRecord[] {
  const agreedAt = now.toISOString()
  return REQUIRED_TERMS_CATEGORIES.map((category) => ({
    category,
    version: MEMBER_TERMS_VERSION,
    agreedAt,
  }))
}
