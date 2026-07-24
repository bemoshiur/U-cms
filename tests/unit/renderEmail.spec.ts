import { describe, expect, it } from 'vitest'

import { branding } from '@/branding'
import { renderEmail } from '@/email/renderEmail'

describe('renderEmail', () => {
  it('contains the heading, body HTML, and branding footer', () => {
    const html = renderEmail({
      heading: 'Confirm your email',
      bodyHtml: '<p>Click the link below.</p>',
    })

    expect(html).toContain('Confirm your email')
    expect(html).toContain('<p>Click the link below.</p>')
    expect(html).toContain(branding.companyName)
    expect(html).toContain(branding.supportEmail)
    expect(html).toContain(branding.productName)
  })

  it('escapes HTML-unsafe characters in the heading and attribute values', () => {
    const html = renderEmail({
      heading: '<script>alert("xss")</script>',
      bodyHtml: '<p>body</p>',
      ctaLabel: 'Go & "verify"',
      ctaUrl: 'https://example.com/?a=1&b="2"',
    })

    expect(html).not.toContain('<script>alert("xss")</script>')
    expect(html).toContain('&lt;script&gt;')
    // The CTA URL is used inside an href="..." attribute — quotes in it must
    // be escaped so they cannot break out of the attribute.
    expect(html).toContain('href="https://example.com/?a=1&amp;b=&quot;2&quot;"')
    expect(html).toContain('Go &amp; &quot;verify&quot;')
  })

  it('renders the CTA button only when both ctaLabel and ctaUrl are present', () => {
    // The footer always renders a `mailto:` link, so assert on the CTA
    // anchor specifically (it's the only one with target="_blank").
    const withoutCta = renderEmail({ heading: 'No CTA', bodyHtml: '<p>text</p>' })
    expect(withoutCta).not.toContain('target="_blank"')

    const labelOnly = renderEmail({
      heading: 'Label only',
      bodyHtml: '<p>text</p>',
      ctaLabel: 'Click me',
    })
    expect(labelOnly).not.toContain('target="_blank"')

    const urlOnly = renderEmail({
      heading: 'URL only',
      bodyHtml: '<p>text</p>',
      ctaUrl: 'https://example.com',
    })
    expect(urlOnly).not.toContain('target="_blank"')

    const withCta = renderEmail({
      heading: 'Has CTA',
      bodyHtml: '<p>text</p>',
      ctaLabel: 'Click me',
      ctaUrl: 'https://example.com',
    })
    expect(withCta).toContain('<a href="https://example.com" target="_blank"')
    expect(withCta).toContain('Click me')
  })
})
