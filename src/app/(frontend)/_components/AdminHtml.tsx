import React from 'react'

import { sanitizeAdminHtml } from '@/content/sanitizeHtml'

/**
 * Renders an admin-authored raw-HTML string (board topContent / bottomContent /
 * headerNotice — ref 1-28/2-7) AFTER running it through {@link sanitizeAdminHtml}.
 * This is the one place `dangerouslySetInnerHTML` is used on the public site, and
 * it is ONLY ever fed the sanitizer's allowlisted output (script/handler/style/
 * unsafe-scheme stripped) — closing the T3A/T3B deferred XSS note. Renders
 * nothing when the sanitized result is empty.
 */
export function AdminHtml({ html, className }: { html: unknown; className?: string }) {
  const safe = sanitizeAdminHtml(html)
  if (safe.length === 0) {
    return null
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />
}
