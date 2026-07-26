import sanitizeHtmlLib from 'sanitize-html'

/**
 * Admin-authored-HTML sanitizer (Task 4C — closes the T3A/T3B deferred XSS note).
 *
 * A board's `topContent`, `bottomContent`, and `headerNotice` (ref 1-28/2-7) are
 * RAW HTML strings an admin types into a textarea, rendered verbatim above/below
 * the public board. Rendering them with `dangerouslySetInnerHTML` UNSANITIZED is
 * a stored-XSS sink (a `content.boards` admin — or anyone who reaches that write
 * seam — could plant `<script>`), so every such string MUST pass through
 * {@link sanitizeAdminHtml} first. Rich-text (Lexical) bodies do NOT use this —
 * they render via the official `@payloadcms/richtext-lexical/react` JSX
 * converter (React elements, never a raw HTML string), which is XSS-safe by
 * construction; this sanitizer is only for the legacy raw-HTML textareas.
 *
 * ## Library choice (documented)
 *
 * `sanitize-html` (a pure-Node, allowlist-based sanitizer — no DOM/jsdom
 * dependency, so it runs in a React Server Component without a browser
 * environment, unlike DOMPurify which needs a `window`). We drive it with a
 * conservative ALLOWLIST: only presentational + structural tags survive; every
 * scripting vector is dropped:
 *  - `<script>`/`<style>`/`<iframe>`/`<object>`/`<form>` and unknown tags → removed.
 *  - All `on*` event-handler attributes → removed (not in any allow-list).
 *  - `style` attributes → removed (blocks `expression()` / `url(javascript:)`).
 *  - URL schemes restricted to http/https/mailto/tel (+ relative) — so
 *    `javascript:` / `data:` hrefs and `data:`-image srcs cannot execute.
 *  - `target="_blank"` links are forced to carry `rel="noopener noreferrer"`.
 *
 * Returns a SAFE HTML string suitable for `dangerouslySetInnerHTML`.
 */

const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    'a',
    'b',
    'blockquote',
    'br',
    'caption',
    'code',
    'col',
    'colgroup',
    'div',
    'em',
    'figcaption',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    's',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
  ],
  // No `style` attribute anywhere (drops CSS-based vectors); no `on*` handlers.
  allowedAttributes: {
    a: ['href', 'name', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    col: ['span'],
    colgroup: ['span'],
    '*': ['class'],
  },
  // Only safe schemes — blocks javascript:/data:/vbscript: in href and src.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  // A relative href/src (e.g. /page/12) is allowed (no scheme to validate).
  transformTags: {
    a: (tagName, attribs) => {
      const next = { ...attribs }
      if (next.target === '_blank') {
        next.rel = 'noopener noreferrer'
      }
      return { tagName, attribs: next }
    },
  },
}

/**
 * Sanitizes an admin-authored HTML string to a safe subset (see module doc).
 * Non-string / empty input returns `''`. The result is safe to pass to
 * `dangerouslySetInnerHTML`.
 */
export function sanitizeAdminHtml(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    return ''
  }
  return sanitizeHtmlLib(value, OPTIONS)
}
