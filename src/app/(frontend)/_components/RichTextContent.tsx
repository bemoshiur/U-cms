import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import React from 'react'

/**
 * Safe Lexical rich-text renderer (Task 4C). Renders a `posts.content` /
 * `webContents.content` editor state via the OFFICIAL
 * `@payloadcms/richtext-lexical/react` JSX converter — it builds React ELEMENTS
 * (headings, paragraphs, lists, links, …), never a raw HTML string, so there is
 * no `dangerouslySetInnerHTML` and text content is escaped by React by
 * construction. This is the "SAFE serializer" the task requires for untrusted
 * rich text (admin- or member-authored), as opposed to the admin raw-HTML
 * textareas which go through `sanitizeAdminHtml` instead.
 *
 * The `upload` node converter is disabled (renders nothing): embedded images
 * live in the access-gated `attachments` pool (Task 4-zero) and the content is
 * loaded at depth 0, so an upload node is neither populated nor publicly
 * fetchable here — dropping it avoids a broken/unauthorized image. Post
 * attachments render as explicit `/api/files/download` links in the detail
 * route instead (a documented T4C scope choice).
 */
export function RichTextContent({ data, className }: { data: unknown; className?: string }) {
  if (!data || typeof data !== 'object') {
    return null
  }
  return (
    <RichText
      className={className}
      data={data as SerializedEditorState}
      converters={({ defaultConverters }) => ({
        ...defaultConverters,
        upload: () => null,
      })}
    />
  )
}
