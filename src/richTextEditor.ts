import { lexicalEditor, UploadFeature } from '@payloadcms/richtext-lexical'

/**
 * Shared richText editor (Task 4-zero hardening — closes a B2 re-open on
 * richText fields the collection refactor didn't touch).
 *
 * `lexicalEditor()`'s default feature set includes `UploadFeature` with NO
 * collection restriction, so an image embedded in ANY richText field
 * (`posts.content`, `posts.answer`, `webContents.content`,
 * `adminNotices.content`, `helpEntries.content`) defaults to the
 * FIRST-registered upload collection — `media`, which Task 4-zero made public
 * again (`read: () => true` + `/api/media/file` IP-exempt). That reopens B2: an
 * image embedded in a SECRET post or a tenant-scoped WebContents DRAFT would be
 * world-readable by filename, and it falsifies the Media.ts "nothing
 * access-controlled relates to media" invariant.
 *
 * Fix: restrict `UploadFeature` to the GATED, tenant-scoped `attachments`
 * collection via `enabledCollections` — the drawer's collection allowlist, i.e.
 * the only collection an author can embed an upload from. Applied at the SHARED
 * editor config so every richText field inherits it (none override their own
 * editor). We replace the default upload feature (matched by its `key`) rather
 * than appending, so the restriction is explicit and order-independent.
 *
 * If a field ever genuinely needs to embed a PUBLIC image, that is a deliberate
 * per-field editor override decision — the default for everything is the gated
 * pool.
 */
export const RICHTEXT_UPLOAD_COLLECTIONS = ['attachments'] as const

export const richTextEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures.filter((feature) => feature.key !== 'upload'),
    UploadFeature({ enabledCollections: [...RICHTEXT_UPLOAD_COLLECTIONS] }),
  ],
})
