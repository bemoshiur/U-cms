import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../access/hasMenuAccess'
import { auditCollection } from '../audit/auditCollection'
import { resolveActorLabel } from '../audit/helpers'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const passwordPoliciesAudit = auditCollection('system.passwordPolicies')

/**
 * Governs the denormalized `createdBy` actor label (Task 6C ref 3-9 version
 * history "who created"). Stored as TEXT (a `name(loginId)` snapshot, never a
 * `users` FK) so the audit-style attribution survives later deletion of the
 * author and never adds a cross-transaction lock — the same denormalization the
 * audit-log collections use.
 *
 * This hook is the SOLE authority over the field (there is no field-level
 * `access` on it, so the value it sets is not stripped on a normal,
 * non-overrideAccess admin create):
 *  - CREATE: force the value from the acting user, IGNORING any client-supplied
 *    value (anti-spoof). Falls back to an explicit value only when there is no
 *    acting user — the seed create (overrideAccess, no `req.user`) passes
 *    `createdBy: 'system (seed)'` this way.
 *  - UPDATE: delete it from the incoming data so an edit can never rewrite the
 *    original author (Payload keeps the existing column value when a field is
 *    absent from the update payload) — the version's authorship is immutable.
 */
const stampCreatedBy: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation === 'create') {
    const label = resolveActorLabel(req?.user)
    data.createdBy = label ?? data.createdBy ?? undefined
  } else {
    delete data.createdBy
  }
  return data
}

/**
 * Legacy 비밀번호 작성 규칙 (Password Composition Rules) — ref 3-9; Task 1D
 * brief Part 2. Holds the *human-readable* password rule text shown to users
 * plus an audit history of rule versions.
 *
 * IMPORTANT — code/DB split: this collection is **display + history only**.
 * The rules that are actually *enforced* live in code
 * (`src/auth/validatePassword.ts`), matching legacy behavior where the
 * displayed text and the enforced rule were maintained separately. Editing a
 * policy's `ruleText` changes what users are *shown*, not what is *rejected*.
 * See the doc comment on `validatePassword` for the full rationale.
 *
 * "Active policy = the most recently created among those flagged `isActive`"
 * (legacy rule-selection logic, ref 3-9). Modeled as a checkbox per row rather
 * than a single-active constraint so the legacy semantics are preserved
 * verbatim; `activePasswordPolicy()` resolves the effective one.
 *
 * Gated on `system.passwordPolicies` (see the adminMenus seed).
 */
export const PasswordPolicies: CollectionConfig = {
  slug: 'passwordPolicies',
  admin: {
    group: 'System',
    useAsTitle: 'ruleText',
    defaultColumns: ['ruleText', 'isActive', 'createdAt'],
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'system.passwordPolicies'),
  },
  access: menuAccessConfig('system.passwordPolicies'),
  fields: [
    {
      name: 'ruleText',
      type: 'textarea',
      required: true,
      admin: {
        description:
          'Human-readable password rule shown to users (legacy 비밀번호 규칙). Note: this text is informational — enforcement is fixed in code (src/auth/validatePassword.ts).',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Legacy 사용여부. The most recently created policy among those marked active is the one displayed to users.',
      },
    },
    {
      name: 'createdBy',
      type: 'text',
      admin: {
        // Governed entirely by `stampCreatedBy` (server-forced on create,
        // immutable on update) — read-only in the UI, no field-level `access`
        // so the hook's value is not stripped on a normal admin create.
        readOnly: true,
        description:
          'Who created this policy version (legacy version-history attribution). A denormalized name(loginId) snapshot, stamped by the system on create; not editable.',
      },
    },
    // `createdAt` is added automatically by Payload (timestamps) and is what
    // the "most recently created active" selection orders by — no explicit
    // field needed.
  ],
  hooks: {
    beforeChange: [stampCreatedBy],
    afterChange: [passwordPoliciesAudit.afterChange],
    afterDelete: [passwordPoliciesAudit.afterDelete],
  },
}

/**
 * Resolves the effective (displayed) password policy: the most recently
 * created among those flagged `isActive`, or `null` if none. Mirrors the
 * legacy rule-selection logic (ref 3-9). Enforcement does NOT depend on this
 * — it's for surfacing the human-readable text (e.g. on a future login /
 * account-request UI).
 */
export async function activePasswordPolicyText(
  payload: import('payload').Payload,
): Promise<string | null> {
  const found = await payload.find({
    collection: 'passwordPolicies',
    where: { isActive: { equals: true } },
    sort: '-createdAt',
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.ruleText ?? null
}
