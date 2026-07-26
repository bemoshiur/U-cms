import Link from 'next/link'
import React from 'react'

import { fileDownloadUrl } from '@/content/boardList'
import type { Post } from '@/payload-types'

/**
 * Gallery / photo board grid (ref 2-5 썸네일형). Each card links to the post and
 * shows its REPRESENTATIVE attachment thumbnail — served through the managed
 * `/api/files/download` endpoint (never a raw media path), so the same
 * members-only, same-site, non-secret download policy applies to thumbnails.
 * A post with no representative attachment renders a text-only card.
 */
export function GalleryGrid({ bbsId, posts }: { bbsId: string; posts: Post[] }) {
  if (posts.length === 0) {
    return <p className="page__empty">No items yet.</p>
  }
  return (
    <ul className="gallery" role="list">
      {posts.map((post) => {
        const attachments = Array.isArray(post.attachments) ? post.attachments : []
        const rep = attachments.find((a) => a?.isRepresentative === true) ?? attachments[0]
        const fileSn = rep && typeof rep.fileSn === 'number' ? rep.fileSn : undefined
        const thumbUrl = fileSn !== undefined ? fileDownloadUrl(post.id, fileSn) : undefined
        return (
          <li key={post.id} className="gallery__item">
            <Link className="gallery__link" href={`/board/${bbsId}/${post.id}`}>
              {thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="gallery__thumb" src={thumbUrl} alt="" loading="lazy" />
              ) : (
                <span className="gallery__thumb gallery__thumb--empty" aria-hidden="true" />
              )}
              <span className="gallery__caption">{post.title}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
