import React from 'react'

import { fileDownloadUrl } from '@/content/boardList'
import type { Post } from '@/payload-types'

/**
 * Renders a post's attachments as managed-download links (Task 4C). Every link
 * points at `/api/files/download?post=&fileSn=` — the ONE sanctioned fetch path
 * (T4B: members-only, same-site, non-secret) — NEVER a raw media/attachment
 * path. The visible label is the attachment description or its filename.
 */
export function AttachmentLinks({ post }: { post: Post }) {
  const attachments = Array.isArray(post.attachments) ? post.attachments : []
  if (attachments.length === 0) {
    return null
  }
  return (
    <section className="attachments" aria-label="Attachments">
      <h2 className="attachments__title">Attachments</h2>
      <ul className="attachments__list" role="list">
        {attachments.map((att, i) => {
          const media = att?.media
          const filename =
            media && typeof media === 'object'
              ? (media as { filename?: string }).filename
              : undefined
          const label = att?.description || filename || `File ${i + 1}`
          const fileSn = typeof att?.fileSn === 'number' ? att.fileSn : i + 1
          return (
            <li key={`${fileSn}-${i}`} className="attachments__item">
              <a className="attachments__link" href={fileDownloadUrl(post.id, fileSn)}>
                {label}
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
