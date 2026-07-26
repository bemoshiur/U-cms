/**
 * Member terms-consent snapshot (Task 4B Part 3 → CLOSED in Task 4E; refs 2-13
 * 회원가입 약관동의, 2-14/2-16).
 *
 * ## The T4E seam — now closed
 *
 * Legacy U-CMS stored VERSIONED terms documents (the five fixed categories, one
 * active version each) that a member had to agree to at sign-up, retaining the
 * accepted version as consent evidence. That versioned `termsDocuments`
 * collection now EXISTS (Task 4E). At sign-up we still record, per accepted
 * consent category, `{ category, version, agreedAt }` on the member
 * (`members.termsConsents`, field-access-locked so a member can never rewrite
 * their own history — see Members.ts), but `version` is now the REAL id of the
 * active (published) `termsDocuments` version for that category on the member's
 * site (resolved by {@link buildTermsConsents}), not a placeholder.
 *
 * The consent category identifiers (`service`/`privacy`) stay stable (so
 * `members.termsConsents.category` needs no migration); each maps to a real
 * terms `category` via `SIGNUP_CONSENT_TO_TERMS_CATEGORY`. Historical snapshots
 * keep whatever version they captured (immutable evidence) even as new terms
 * versions are published — no data migration of past consent is needed.
 */

import type { Payload } from 'payload'

import { SIGNUP_CONSENT_TO_TERMS_CATEGORY } from '../content/terms'

/** A terms category a member consents to at sign-up. */
export type TermsCategory = 'service' | 'privacy'

/**
 * The consent categories a member MUST agree to at sign-up (the two mandatory
 * legacy agreements — Terms of Use + personal-information collection/use).
 * `marketing` is a separate OPTIONAL opt-in (`members.marketingConsent`), not a
 * required term.
 */
export const REQUIRED_TERMS_CATEGORIES: readonly TermsCategory[] = ['service', 'privacy']

/**
 * Fallback version stored in a consent snapshot when NO active `termsDocuments`
 * version exists for a category on the site (e.g. the site's terms haven't been
 * authored yet). Forward-compatible: sign-up never blocks on missing terms, and
 * the snapshot still records that some agreement was captured at that time.
 */
export const MEMBER_TERMS_VERSION_FALLBACK = 'unversioned'

/** One stored consent record (mirrors the `members.termsConsents` array row). */
export type TermsConsentRecord = {
  category: TermsCategory
  version: string
  agreedAt: string
}

/**
 * Resolves the ACTIVE (published) `termsDocuments` version id for one category
 * on a site, or `null` when the site has no published terms for it. Uses the
 * published-version semantics documented on `TermsDocuments`: `payload.find`
 * (default `draft:false`) returns the published document, and `findVersions`
 * filtered to `version._status = published`, newest first, yields the active
 * version's id — the exact snapshot a consent references.
 */
export async function resolveActiveTermsVersion(
  payload: Payload,
  siteId: string | number,
  termsCategory: string,
): Promise<string | null> {
  const docs = await payload.find({
    collection: 'termsDocuments',
    where: { and: [{ tenant: { equals: siteId } }, { category: { equals: termsCategory } }] },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const doc = docs.docs[0]
  if (!doc) {
    return null
  }
  const versions = await payload.findVersions({
    collection: 'termsDocuments',
    where: {
      and: [{ parent: { equals: doc.id } }, { 'version._status': { equals: 'published' } }],
    },
    sort: '-updatedAt',
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const versionId = versions.docs[0]?.id
  return versionId !== undefined ? String(versionId) : null
}

/**
 * Builds the consent snapshot to persist on a member for the required
 * categories, stamping the REAL active terms version id (per category, per site)
 * + an `agreedAt` timestamp. `now` is injectable for deterministic tests. This
 * is the ONE place the version identifier is resolved — signup + the seed both
 * route through it.
 */
export async function buildTermsConsents(
  payload: Payload,
  siteId: string | number,
  now: Date = new Date(),
): Promise<TermsConsentRecord[]> {
  const agreedAt = now.toISOString()
  const records: TermsConsentRecord[] = []
  for (const category of REQUIRED_TERMS_CATEGORIES) {
    const termsCategory = SIGNUP_CONSENT_TO_TERMS_CATEGORY[category]
    const version = await resolveActiveTermsVersion(payload, siteId, termsCategory)
    records.push({ category, version: version ?? MEMBER_TERMS_VERSION_FALLBACK, agreedAt })
  }
  return records
}
