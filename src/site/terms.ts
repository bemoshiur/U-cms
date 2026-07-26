/**
 * Public-site TERMS loaders (Task 4E; refs 2-15, 2-16). Thin, tenant-scoped
 * reads over the Local API that back the `/terms/[category]` route. Same
 * `overrideAccess: true` posture as the other public loaders (`src/site/data.ts`)
 * — the RSC server is a trusted read surface and every query is CONSTRAINED to
 * the active site's tenant, so nothing cross-site is ever returned. Only the
 * ACTIVE (published) version's body is exposed; drafts never surface publicly.
 */

import type { Payload } from 'payload'

import type { TermsDocument } from '../payload-types'
import { isTermsCategory } from '../content/terms'

/**
 * The ACTIVE terms document for a category on a site — the PUBLISHED version
 * (`payload.find` defaults to `draft:false`, so a draft saved on top never
 * shows). Returns `null` for an unknown category, cross-site, or when the site
 * has no published terms for it.
 */
export async function loadActiveTerms(
  payload: Payload,
  tenantId: string | number,
  category: string,
): Promise<TermsDocument | null> {
  if (!isTermsCategory(category)) {
    return null
  }
  const found = await payload.find({
    collection: 'termsDocuments',
    where: { and: [{ tenant: { equals: tenantId } }, { category: { equals: category } }] },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true, // find() returns the published version by default
  })
  return (found.docs[0] as TermsDocument | undefined) ?? null
}

/** One entry in the public change-history list (ref 2-16). */
export type TermsHistoryEntry = {
  versionId: string | number
  title: string
  effectiveDate: string | null
  updatedAt: string | null
  /** True for the version that is currently active (the newest published one). */
  current: boolean
}

/**
 * The PUBLISHED version history of a terms document, newest first (ref 2-16 —
 * the manual's "query this history for the user-facing change log"). Drafts are
 * excluded (`version._status = published`), so a draft/unpublished revision is
 * NEVER shown publicly. Tenant-constrained via the parent document (already
 * resolved on the active site).
 */
export async function loadTermsHistory(
  payload: Payload,
  termsDocId: string | number,
): Promise<TermsHistoryEntry[]> {
  const res = await payload.findVersions({
    collection: 'termsDocuments',
    where: {
      and: [{ parent: { equals: termsDocId } }, { 'version._status': { equals: 'published' } }],
    },
    sort: '-updatedAt',
    limit: 50,
    pagination: false,
    overrideAccess: true,
  })
  return res.docs.map((row, index) => {
    const version = (row.version ?? {}) as {
      title?: unknown
      effectiveDate?: unknown
    }
    return {
      versionId: row.id,
      title: typeof version.title === 'string' ? version.title : '',
      effectiveDate: typeof version.effectiveDate === 'string' ? version.effectiveDate : null,
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
      current: index === 0,
    }
  })
}
