import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_PUBLIC_SITE_ID, getPublicSiteId } from '@/site/config'

const ORIGINAL = process.env.PUBLIC_SITE_ID

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.PUBLIC_SITE_ID
  } else {
    process.env.PUBLIC_SITE_ID = ORIGINAL
  }
})

describe('getPublicSiteId (site-resolution seam)', () => {
  it('defaults to the demo site when PUBLIC_SITE_ID is unset', () => {
    delete process.env.PUBLIC_SITE_ID
    expect(getPublicSiteId()).toBe(DEFAULT_PUBLIC_SITE_ID)
    expect(DEFAULT_PUBLIC_SITE_ID).toBe('demo')
  })

  it('defaults to demo when PUBLIC_SITE_ID is blank/whitespace', () => {
    process.env.PUBLIC_SITE_ID = '   '
    expect(getPublicSiteId()).toBe(DEFAULT_PUBLIC_SITE_ID)
  })

  it('honors and trims an explicit PUBLIC_SITE_ID', () => {
    process.env.PUBLIC_SITE_ID = '  bos  '
    expect(getPublicSiteId()).toBe('bos')
  })
})
