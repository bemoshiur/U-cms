/**
 * Public-site resolution seam (Task 4A).
 *
 * ## The seam and why it exists
 *
 * The public frontend is PER-SITE (tenant): every page renders the chrome and
 * content of exactly one `sites` record. Legacy resolved the active site from
 * the request host (each site had its own domain). The rebuild is not yet
 * multi-host, so — deliberately — the active site is chosen by a single
 * environment variable, `PUBLIC_SITE_ID`, defaulting to the seeded `demo`
 * site. This keeps every read in one obvious place (`resolveSiteRecord` in
 * `./data.ts`) and makes local/dev deterministic.
 *
 * ## What replaces this later (documented, intentional)
 *
 * Real multi-host routing (host → site, or a `/[siteId]/…` path prefix) is a
 * later Phase-4 concern. When it lands, only `getPublicSiteId` needs to change
 * to read the resolved site id from the request (host header / route param)
 * instead of the env — every consumer already goes through this function, so
 * nothing else moves.
 */

/** The site rendered when `PUBLIC_SITE_ID` is unset (the seeded user-facing site). */
export const DEFAULT_PUBLIC_SITE_ID = 'demo'

/**
 * The `siteId` (the `sites.siteId` natural key, e.g. `demo`) of the site the
 * public frontend currently renders. Reads `PUBLIC_SITE_ID`, trimming and
 * falling back to {@link DEFAULT_PUBLIC_SITE_ID} when unset/blank. Kept pure
 * and env-only so the resolution rule has one home (see the module docblock).
 */
export function getPublicSiteId(): string {
  const raw = process.env.PUBLIC_SITE_ID
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  return trimmed.length > 0 ? trimmed : DEFAULT_PUBLIC_SITE_ID
}
