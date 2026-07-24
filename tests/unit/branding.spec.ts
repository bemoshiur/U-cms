import { describe, expect, it } from 'vitest'

import { branding } from '@/branding'

describe('branding', () => {
  it('exports the expected shape', () => {
    expect(branding).toMatchObject({
      productName: expect.any(String),
      companyName: expect.any(String),
      tagline: expect.any(String),
      supportEmail: expect.any(String),
      colors: {
        primary: expect.any(String),
        primaryDark: expect.any(String),
        success: expect.any(String),
        warning: expect.any(String),
        error: expect.any(String),
      },
      urls: {
        website: expect.any(String),
      },
    })
  })

  it('has non-empty product identity fields', () => {
    expect(branding.productName.length).toBeGreaterThan(0)
    expect(branding.companyName.length).toBeGreaterThan(0)
    expect(branding.supportEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  })

  it('uses hex color values', () => {
    const hex = /^#[0-9a-fA-F]{3,8}$/
    expect(branding.colors.primary).toMatch(hex)
    expect(branding.colors.primaryDark).toMatch(hex)
    expect(branding.colors.success).toMatch(hex)
    expect(branding.colors.warning).toMatch(hex)
    expect(branding.colors.error).toMatch(hex)
  })

  it('has a valid website URL', () => {
    expect(() => new URL(branding.urls.website)).not.toThrow()
  })
})
