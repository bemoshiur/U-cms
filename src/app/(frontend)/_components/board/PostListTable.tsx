import Link from 'next/link'
import React from 'react'

import { formatPostCell, isNewPost, type DisplayColumn } from '@/content/boardList'
import type { Post } from '@/payload-types'

/**
 * Standard/notice board list table (ref 2-5, 2-7). Renders the board's configured
 * LIST columns (`listColumns`), with in-window NOTICES pinned above the regular,
 * paginated posts. The title cell links to the post detail and shows the New
 * icon within the board's window; every other cell is projected by the pure
 * `formatPostCell`. All cell values are React-escaped (no HTML injection).
 */
export function PostListTable({
  bbsId,
  columns,
  notices,
  posts,
  startNumber,
  newIconWindow,
  now = new Date(),
}: {
  bbsId: string
  columns: DisplayColumn[]
  notices: Post[]
  posts: Post[]
  /** 1-based number of the first regular row on this page. */
  startNumber: number
  newIconWindow: number | null | undefined
  now?: Date
}) {
  const cols = columns.length > 0 ? columns : [{ key: 'title', label: 'Title' }]

  const renderRow = (post: Post, rowNumber: number, isNotice: boolean) => (
    <tr
      key={`${isNotice ? 'n' : 'p'}-${post.id}`}
      className={isNotice ? 'board-list__row--notice' : undefined}
    >
      {cols.map((col) => {
        if (col.key === 'title') {
          return (
            <td key={col.key} className="board-list__cell board-list__cell--title">
              <Link className="board-list__title-link" href={`/board/${bbsId}/${post.id}`}>
                {post.title}
              </Link>
              {isNewPost(post, newIconWindow, now) && (
                <span className="board-list__new" aria-label="New">
                  N
                </span>
              )}
            </td>
          )
        }
        if (col.key === 'number' && isNotice) {
          return (
            <td key={col.key} className="board-list__cell board-list__cell--notice">
              Notice
            </td>
          )
        }
        return (
          <td key={col.key} className="board-list__cell">
            {formatPostCell(post as unknown as Record<string, unknown>, col.key, rowNumber)}
          </td>
        )
      })}
    </tr>
  )

  const isEmpty = notices.length === 0 && posts.length === 0

  return (
    <table className="board-list">
      <thead>
        <tr>
          {cols.map((col) => (
            <th key={col.key} scope="col" className="board-list__head">
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {notices.map((post) => renderRow(post, 0, true))}
        {posts.map((post, i) => renderRow(post, startNumber + i, false))}
        {isEmpty && (
          <tr>
            <td className="board-list__empty" colSpan={cols.length}>
              No posts yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
