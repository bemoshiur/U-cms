import Link from 'next/link'
import React from 'react'

import type { Pagination } from '@/content/boardList'

/**
 * Board list pager (ref 2-7). Renders the page-window block from
 * {@link Pagination}, preserving the current search query on every page link so
 * paging keeps the active filters. No-JS friendly (plain links).
 */
export function Pager({
  pagination,
  basePath,
  query,
}: {
  pagination: Pagination
  basePath: string
  query?: Record<string, string>
}) {
  if (pagination.totalPages <= 1) {
    return null
  }
  const href = (page: number): string => {
    const sp = new URLSearchParams(query ?? {})
    sp.set('page', String(page))
    return `${basePath}?${sp.toString()}`
  }
  return (
    <nav className="pager" aria-label="Pagination">
      <ul className="pager__list" role="list">
        {pagination.hasPrev && (
          <li className="pager__item">
            <Link className="pager__link" href={href(pagination.page - 1)} rel="prev">
              Previous
            </Link>
          </li>
        )}
        {pagination.pages.map((p) => (
          <li key={p} className="pager__item">
            {p === pagination.page ? (
              <span className="pager__current" aria-current="page">
                {p}
              </span>
            ) : (
              <Link className="pager__link" href={href(p)}>
                {p}
              </Link>
            )}
          </li>
        ))}
        {pagination.hasNext && (
          <li className="pager__item">
            <Link className="pager__link" href={href(pagination.page + 1)} rel="next">
              Next
            </Link>
          </li>
        )}
      </ul>
    </nav>
  )
}
