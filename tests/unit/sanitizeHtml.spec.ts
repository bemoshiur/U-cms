import { describe, expect, it } from 'vitest'

import { sanitizeAdminHtml } from '@/content/sanitizeHtml'

/**
 * Task 4C — the admin-HTML sanitizer that closes the deferred T3A/T3B XSS note
 * for board topContent/bottomContent/headerNotice (rendered via
 * dangerouslySetInnerHTML). Proves scripting vectors are neutralized while safe
 * presentational markup is preserved.
 */
describe('sanitizeAdminHtml', () => {
  it('strips <script> tags and their content', () => {
    const out = sanitizeAdminHtml('<p>Hello</p><script>alert(1)</script>')
    expect(out).toContain('<p>Hello</p>')
    expect(out).not.toContain('<script')
    expect(out.toLowerCase()).not.toContain('alert(1)')
  })

  it('removes on* event-handler attributes', () => {
    const out = sanitizeAdminHtml('<img src="https://x.io/a.png" onerror="alert(1)" alt="a" />')
    expect(out).toContain('src="https://x.io/a.png"')
    expect(out).not.toContain('onerror')
  })

  it('drops javascript: hrefs but keeps safe http links', () => {
    const evil = sanitizeAdminHtml('<a href="javascript:alert(1)">x</a>')
    expect(evil).not.toContain('javascript:')

    const safe = sanitizeAdminHtml('<a href="https://example.com">ok</a>')
    expect(safe).toContain('href="https://example.com"')
  })

  it('drops data: image sources (only http/https allowed for img)', () => {
    const out = sanitizeAdminHtml('<img src="data:text/html;base64,PHNjcmlwdD4=" alt="x" />')
    expect(out).not.toContain('data:')
  })

  it('removes style attributes (blocks CSS-based vectors)', () => {
    const out = sanitizeAdminHtml('<div style="background:url(javascript:alert(1))">x</div>')
    expect(out).not.toContain('style=')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('<div')
  })

  it('strips unknown/unsafe tags (iframe, object, form) while keeping text', () => {
    const out = sanitizeAdminHtml('<iframe src="https://evil.io"></iframe><p>kept</p>')
    expect(out).not.toContain('<iframe')
    expect(out).toContain('kept')
  })

  it('forces rel=noopener noreferrer on target=_blank links', () => {
    const out = sanitizeAdminHtml('<a href="https://x.io" target="_blank">x</a>')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('preserves safe structural markup (tables, lists, headings)', () => {
    const html = '<h2>Title</h2><ul><li>one</li></ul><table><tr><td>cell</td></tr></table>'
    const out = sanitizeAdminHtml(html)
    expect(out).toContain('<h2>Title</h2>')
    expect(out).toContain('<li>one</li>')
    expect(out).toContain('<td>cell</td>')
  })

  it('returns empty string for non-string / empty input', () => {
    expect(sanitizeAdminHtml(null)).toBe('')
    expect(sanitizeAdminHtml(undefined)).toBe('')
    expect(sanitizeAdminHtml('')).toBe('')
    expect(sanitizeAdminHtml(42)).toBe('')
  })
})
