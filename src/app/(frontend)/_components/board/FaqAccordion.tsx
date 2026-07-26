import React from 'react'

import { toRelationId } from '@/collections/utils'
import type { Post } from '@/payload-types'
import { RichTextContent } from '../RichTextContent'

/**
 * FAQ accordion (ref 2-6), grouped by the post's first category. Uses native
 * `<details>/<summary>` so it works with NO JavaScript (progressive
 * enhancement). The question is the post title; the answer is the SAFE
 * rich-text body (for a `faq` board the body holds the answer). Grouping falls
 * back to a single "General" group when a post has no category.
 */
export function FaqAccordion({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return <p className="page__empty">No FAQs yet.</p>
  }

  // Group by category1 label (populated at depth 1), else "General".
  const groups = new Map<string, Post[]>()
  for (const post of posts) {
    const cat = post.category1
    const label =
      cat && typeof cat === 'object' ? ((cat as { name?: string }).name ?? 'General') : 'General'
    const key = toRelationId(cat) !== undefined ? label : 'General'
    const bucket = groups.get(key) ?? []
    bucket.push(post)
    groups.set(key, bucket)
  }

  return (
    <div className="faq">
      {[...groups.entries()].map(([label, items]) => (
        <section className="faq__group" key={label}>
          <h2 className="faq__group-title">{label}</h2>
          {items.map((post) => (
            <details className="faq__item" key={post.id}>
              <summary className="faq__question">{post.title}</summary>
              <div className="faq__answer">
                <RichTextContent data={post.content} />
              </div>
            </details>
          ))}
        </section>
      ))}
    </div>
  )
}
