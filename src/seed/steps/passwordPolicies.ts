import type { SeedStep } from '../types'

/**
 * The default password composition rule text shown to users (legacy ref 3-9).
 * English rendering of the legacy Korean sample rule. This is DISPLAY text
 * only — enforcement is fixed in code (`src/auth/validatePassword.ts`); see
 * the doc comment on `PasswordPolicies` for the code/DB split.
 */
export const DEFAULT_PASSWORD_POLICY_TEXT =
  'Minimum 10 characters combining 2+ character types, or 8+ characters combining all 3 types. ' +
  'Avoid sequential characters, birthdays, phone numbers, or values similar to your login ID. ' +
  'Change your password at least every 6 months.'

/**
 * Seeds one active default password policy (ref 3-9). Idempotent: if any
 * policy with the default text already exists, it is left untouched (an
 * operator may have edited/deactivated it, or added newer versions — this
 * step must not clobber that history). Only creates the default when absent.
 */
export const passwordPoliciesStep: SeedStep = {
  name: 'password-policies',
  async run(payload) {
    const existing = await payload.find({
      collection: 'passwordPolicies',
      where: { ruleText: { equals: DEFAULT_PASSWORD_POLICY_TEXT } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      payload.logger.info('[seed:password-policies] default policy already exists — skipping.')
      return
    }

    await payload.create({
      collection: 'passwordPolicies',
      // `createdBy` is system-stamped and not client-writable; overrideAccess
      // (used here) bypasses that field gate so the seeded default carries a
      // clear attribution in the version-history view (Task 6C ref 3-9).
      data: { ruleText: DEFAULT_PASSWORD_POLICY_TEXT, isActive: true, createdBy: 'system (seed)' },
      overrideAccess: true,
    })
    payload.logger.info('[seed:password-policies] created default active policy.')
  },
}
