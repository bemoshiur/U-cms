import type { Access, Where } from 'payload'

import { hasMenuAccess, isSuperUser } from './hasMenuAccess'
import { getAssignedTenantIds } from './tenantAccess'

/**
 * Menu key gating the §3 security-document board libraries (Task 6D; legacy
 * ref 3-4, plan §2.3). The four legacy libraries — 보안교육 (Security Education),
 * 보안사례 (Security Cases), 개인정보 관리계획 (Security Management Plan) and
 * 침해사고 대응지침 (Incident Response Guidelines) — are FOUR mounted boards, not
 * new code: ordinary board-engine records flagged `securityDoc: true`. But they
 * belong to the Privacy Protection System (§3), so they are gated on THIS
 * privacy menuKey rather than the general `content.boards`/`content.posts`
 * grant a content admin holds — a content admin must NOT see the security docs
 * (the whole §3 subsystem is privacy-role gated). See task-6D-report.md.
 */
export const SECURITY_DOCS_MENU_KEY = 'privacy.securityDocs'

/**
 * Composite tenant-scoped access for the shared board engine collections
 * (`boards`, `posts`) so ONE collection serves BOTH audiences without a
 * separate feature module (plan §2.3 "no new code"):
 *
 *  - `securityDoc: true` rows  → gated on {@link SECURITY_DOCS_MENU_KEY}
 *    (privacy roles) — a content admin can neither read nor write them.
 *  - `securityDoc` false/NULL rows (every ordinary board/post) → gated on the
 *    collection's normal `contentMenuKey` (`content.boards`/`content.posts`).
 *
 * The rule (mirrors `tenantScopedMenuAccess`, extended with the security-doc
 * split):
 *  - no user → deny;
 *  - `isSuper` → full access (all tenants, both classes) — the grant/tenant
 *    bypass super holds everywhere else;
 *  - neither the content grant nor the privacy grant → deny;
 *  - no assigned tenants (non-super) → deny (an empty `in` matches nothing);
 *  - otherwise → a `Where` that unions the classes the caller is entitled to,
 *    intersected with their assigned tenants.
 *
 * Payload's `not_equals: true` compiles to `(col IS NULL OR col <> true)` (see
 * `@payloadcms/drizzle` parseParams), so the content branch correctly includes
 * every legacy/ordinary board whose `securityDoc` is NULL or false — this is
 * NOT a behavior change for existing boards, only an added exclusion of the new
 * security-doc rows. For `create`, Payload treats any truthy return as "allowed"
 * and enforces the actual class/tenant at write time via the collections' own
 * `beforeValidate` guards + the `securityDoc` field-level access (create/update
 * of the flag itself requires the privacy grant), so a content admin can never
 * mint or flip a row into the security-doc class.
 */
export function securityDocScopedAccess(
  contentMenuKey: string,
  tenantFieldName = 'tenant',
): Access {
  return async ({ req }) => {
    if (!req.user) {
      return false
    }
    // Super-admins bypass grants AND tenant scoping, for both classes.
    if (isSuperUser(req.user)) {
      return true
    }
    const [hasContent, hasPrivacy] = await Promise.all([
      hasMenuAccess(req, contentMenuKey),
      hasMenuAccess(req, SECURITY_DOCS_MENU_KEY),
    ])
    if (!hasContent && !hasPrivacy) {
      return false
    }
    const tenantIds = getAssignedTenantIds(req.user)
    if (tenantIds.length === 0) {
      return false
    }
    const classBranches: Where[] = []
    if (hasContent) {
      // NULL or false — every ordinary board/post (legacy rows are NULL).
      classBranches.push({ securityDoc: { not_equals: true } })
    }
    if (hasPrivacy) {
      classBranches.push({ securityDoc: { equals: true } })
    }
    const classWhere: Where =
      classBranches.length === 1 ? (classBranches[0] as Where) : { or: classBranches }
    return { and: [classWhere, { [tenantFieldName]: { in: tenantIds } }] }
  }
}
