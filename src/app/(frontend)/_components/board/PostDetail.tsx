import React from 'react'

import { formatPostCell, type DisplayColumn } from '@/content/boardList'
import type { Post } from '@/payload-types'
import { RichTextContent } from '../RichTextContent'
import { AttachmentLinks } from './AttachmentLinks'

/**
 * Post detail (ref 2-5). Renders the meta fields in the board's DETAIL order
 * (`detailFieldOrder` + detailFlag — the `title`/`content`/`attachment` keys are
 * surfaced by the dedicated heading/body/attachments blocks, so they're skipped
 * in the meta list), the SAFE rich-text body, the managed-download attachment
 * links, and — for a Q&A board — the admin answer thread with its attribution.
 */
export function PostDetail({
  post,
  columns,
  isQna,
}: {
  post: Post
  columns: DisplayColumn[]
  isQna: boolean
}) {
  const metaColumns = columns.filter(
    (c) => c.key !== 'title' && c.key !== 'content' && c.key !== 'attachment',
  )
  const answeredBy = post.answeredBy
  const answeredByName =
    answeredBy && typeof answeredBy === 'object'
      ? ((answeredBy as { name?: string; email?: string }).name ??
        (answeredBy as { email?: string }).email ??
        null)
      : null

  return (
    <article className="post-detail">
      {metaColumns.length > 0 && (
        <dl className="post-detail__meta">
          {metaColumns.map((col) => (
            <div className="post-detail__meta-row" key={col.key}>
              <dt className="post-detail__meta-key">{col.label}</dt>
              <dd className="post-detail__meta-value">
                {formatPostCell(post as unknown as Record<string, unknown>, col.key, 0)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="post-detail__body">
        <RichTextContent data={post.content} />
      </div>

      <AttachmentLinks post={post} />

      {isQna && post.isAnswered && (
        <section className="post-detail__answer" aria-label="Answer">
          <h2 className="post-detail__answer-title">Answer</h2>
          <RichTextContent data={post.answer} />
          {(answeredByName || post.answeredAt) && (
            <p className="post-detail__answer-meta">
              {answeredByName && <span>Answered by {answeredByName}</span>}
              {post.answeredAt && (
                <span className="post-detail__answer-date"> on {String(post.answeredAt)}</span>
              )}
            </p>
          )}
        </section>
      )}
    </article>
  )
}
