import { toRelationId } from '../collections/utils'

/**
 * The COMPLETE set of ways a `posts` document references an `attachments`
 * upload (Task 6D — round-5 cap). A post can point at an attachment through
 * exactly THREE sites, and no others:
 *
 *   (a) the `attachments[]` array field — each row's `media` upload relationship;
 *   (b) upload nodes embedded in the `content` richText (Lexical JSON);
 *   (c) upload nodes embedded in the `answer` richText (Q&A, Lexical JSON).
 *
 * The shared editor's `UploadFeature` is restricted to the `attachments`
 * collection (see `src/richTextEditor.ts`), so an inline embed in `content`/
 * `answer` is an `attachments` reference that lives in the Lexical JSON — NOT in
 * the `posts_attachments` join table — which is exactly the site the array-only
 * §3 sync missed. `boardType`/`department`/`authorUser`/`answeredBy`/`categoryN`
 * are relationships to OTHER collections (boardTypes/departments/users/codes),
 * never to `attachments`; the representative-thumbnail and download endpoints
 * resolve their media THROUGH the array rows above. So these three sites are the
 * whole reference surface — the §3 flag sync + the ordinary-post cross-reference
 * guard both key off `postAttachmentRefIds`, so no fourth door can exist.
 */

const ATTACHMENTS_SLUG = 'attachments'

/**
 * Walks a Lexical editor-state, collecting the ids of every `upload`/`relationship`
 * node that points at the `attachments` collection. Tolerant of null/malformed
 * input; handles a node `value` that is a raw id or a populated `{ id }` object.
 * Recurses `children` (block/list/quote wrappers) so a nested embed is not missed.
 */
export function extractLexicalAttachmentIds(value: unknown): (string | number)[] {
  const ids: (string | number)[] = []

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return
    }
    const n = node as {
      type?: unknown
      relationTo?: unknown
      value?: unknown
      children?: unknown
    }
    if ((n.type === 'upload' || n.type === 'relationship') && n.relationTo === ATTACHMENTS_SLUG) {
      const id = toRelationId(n.value)
      if (id !== undefined) {
        ids.push(id)
      }
    }
    if (Array.isArray(n.children)) {
      for (const child of n.children) {
        walk(child)
      }
    }
  }

  const root = (value as { root?: unknown } | null | undefined)?.root
  walk(root ?? value)
  return ids
}

/**
 * The de-duplicated set of every `attachments` id a post references across ALL
 * three sites — the array field plus the `content` and `answer` richText bodies.
 * The single source of truth for both the §3 denorm sync (`syncAttachmentSecurityDoc`)
 * and the ordinary-post cross-reference guard (`validatePostAgainstBoard`).
 */
export function postAttachmentRefIds(post: {
  attachments?: unknown
  content?: unknown
  answer?: unknown
}): (string | number)[] {
  const seen = new Set<string>()
  const out: (string | number)[] = []
  const add = (id: string | number | undefined): void => {
    if (id === undefined) {
      return
    }
    const key = String(id)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(id)
    }
  }

  const arr = Array.isArray(post.attachments) ? post.attachments : []
  for (const a of arr) {
    add(toRelationId((a as { media?: unknown })?.media))
  }
  for (const id of extractLexicalAttachmentIds(post.content)) {
    add(id)
  }
  for (const id of extractLexicalAttachmentIds(post.answer)) {
    add(id)
  }
  return out
}
