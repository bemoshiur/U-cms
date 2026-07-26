import { describe, expect, it } from 'vitest'

import {
  isTermsCategory,
  SIGNUP_CONSENT_TO_TERMS_CATEGORY,
  TERMS_CATEGORIES,
  TERMS_CATEGORY_VALUES,
  termsCategoryDef,
} from '@/content/terms'

describe('terms categories (Task 4E — confirmed against ref 2-14)', () => {
  it('has exactly the five fixed legacy categories, in column order', () => {
    expect(TERMS_CATEGORY_VALUES).toEqual([
      'termsOfUse',
      'personalInfoProcessing',
      'thirdPartyProvision',
      'uniqueIdCollection',
      'other',
    ])
    expect(TERMS_CATEGORIES).toHaveLength(5)
  })

  it('carries the legacy Korean labels (ref 2-14)', () => {
    expect(termsCategoryDef('termsOfUse')?.korean).toBe('이용약관')
    expect(termsCategoryDef('personalInfoProcessing')?.korean).toBe(
      '개인정보의 수집·이용 등 처리에 관한 사항',
    )
    expect(termsCategoryDef('other')?.korean).toBe('기타')
  })

  it('isTermsCategory guards the public route param', () => {
    expect(isTermsCategory('termsOfUse')).toBe(true)
    expect(isTermsCategory('privacyPolicy')).toBe(false) // the brief placeholder, not real
    expect(isTermsCategory('')).toBe(false)
    expect(isTermsCategory(null)).toBe(false)
  })

  it('maps the two mandatory sign-up consents to real term categories', () => {
    expect(SIGNUP_CONSENT_TO_TERMS_CATEGORY.service).toBe('termsOfUse')
    expect(SIGNUP_CONSENT_TO_TERMS_CATEGORY.privacy).toBe('personalInfoProcessing')
    // Both targets must be real categories.
    expect(isTermsCategory(SIGNUP_CONSENT_TO_TERMS_CATEGORY.service)).toBe(true)
    expect(isTermsCategory(SIGNUP_CONSENT_TO_TERMS_CATEGORY.privacy)).toBe(true)
  })
})
