/**
 * Privacy/terms domain constants (Task 4E; refs 2-14, 2-15, 2-16).
 *
 * ## The 5 FIXED legacy categories (confirmed against ref 2-14)
 *
 * The task brief's illustrative list (`privacyPolicy | termsOfUse |
 * emailCollectionRefusal | videoInfoPolicy | copyrightPolicy`) was a PLACEHOLDER
 * — it does NOT match the manual. Feature-inventory ref 2-14 (PDF 100) fixes the
 * five terms slots per menu, and the ref-2695 correction pins the exact wording.
 * The confirmed five (with their legacy Korean labels) are:
 *
 *   1. `termsOfUse`             이용약관 (Terms of Use)
 *   2. `personalInfoProcessing` 개인정보의 수집·이용 등 처리에 관한 사항
 *                               (collection / use / processing of personal info)
 *   3. `thirdPartyProvision`    개인정보의 제3자 제공에 관한 사항
 *                               (third-party provision of personal info)
 *   4. `uniqueIdCollection`     고유식별정보 수집에 관한 사항
 *                               (collection of unique identifying info)
 *   5. `other`                  기타 (Other terms)
 *
 * These are the ONLY valid `termsDocuments.category` values, and they are
 * permanent identifiers (a public URL `/terms/{category}` and stored member
 * consent snapshots both reference them) — never rename or repurpose one.
 *
 * Pure of any Payload runtime so it is unit-testable and importable by both the
 * collection config and the public routes.
 */

/** One fixed terms category: the stored value + its English + legacy Korean label. */
export type TermsCategoryDef = {
  value: string
  label: string
  korean: string
}

/** The five fixed legacy terms categories, in the ref-2-14 column order. */
export const TERMS_CATEGORIES: readonly TermsCategoryDef[] = [
  { value: 'termsOfUse', label: 'Terms of Use', korean: '이용약관' },
  {
    value: 'personalInfoProcessing',
    label: 'Collection, Use & Processing of Personal Information',
    korean: '개인정보의 수집·이용 등 처리에 관한 사항',
  },
  {
    value: 'thirdPartyProvision',
    label: 'Third-Party Provision of Personal Information',
    korean: '개인정보의 제3자 제공에 관한 사항',
  },
  {
    value: 'uniqueIdCollection',
    label: 'Collection of Unique Identifying Information',
    korean: '고유식별정보 수집에 관한 사항',
  },
  { value: 'other', label: 'Other Terms', korean: '기타' },
] as const

/** The bare category values, for the collection's `select` options + guards. */
export const TERMS_CATEGORY_VALUES: readonly string[] = TERMS_CATEGORIES.map((c) => c.value)

/** Whether `value` is one of the five fixed categories (validates a public route param). */
export function isTermsCategory(value: unknown): value is string {
  return typeof value === 'string' && TERMS_CATEGORY_VALUES.includes(value)
}

/** The full definition for a category value, or `undefined` when unknown. */
export function termsCategoryDef(value: string): TermsCategoryDef | undefined {
  return TERMS_CATEGORIES.find((c) => c.value === value)
}

/**
 * Maps each mandatory sign-up consent category (T4B `members.termsConsents`
 * keeps its stable `service`/`privacy` identifiers) to the real
 * `termsDocuments.category` whose active version supplies the consented version.
 * `service`  → the Terms of Use document;
 * `privacy`  → the personal-information collection/use/processing document.
 * This is the ONE place the T4B consent seam meets the real versioned terms.
 */
export const SIGNUP_CONSENT_TO_TERMS_CATEGORY: Readonly<Record<'service' | 'privacy', string>> = {
  service: 'termsOfUse',
  privacy: 'personalInfoProcessing',
}
