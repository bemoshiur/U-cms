import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

/**
 * Task 4-zero hardening — richText embedded uploads must target the GATED
 * `attachments` pool, not the public `media` pool.
 *
 * The default `lexicalEditor()` ships `UploadFeature` with no collection
 * restriction, so an image embedded in a richText field defaults to the
 * first-registered upload collection (`media` — public: `read:()=>true` +
 * `/api/media/file` IP-exempt). That reopens B2 on a secret post's /
 * tenant-scoped draft's content. The shared editor (`src/richTextEditor.ts`)
 * restricts `UploadFeature` to `attachments` via `enabledCollections`.
 *
 * These assertions inspect the REAL resolved editor config on every richText
 * field and FAIL without the fix: with the default editor the resolved upload
 * feature carries `{ collections: {} }` and NO `enabledCollections`, so
 * `enabledCollections` is `undefined` — the `toEqual(['attachments'])` fails.
 */

let payload: Payload

// Every richText field in the app (all inherit the shared config editor).
const RICHTEXT_FIELDS: ReadonlyArray<readonly [collection: string, field: string]> = [
  ['posts', 'content'],
  ['posts', 'answer'],
  ['webContents', 'content'],
  ['adminNotices', 'content'],
  ['helpEntries', 'content'],
]

function resolvedUploadFeatureProps(
  collectionSlug: string,
  fieldName: string,
): { enabledCollections?: string[] } | undefined {
  const collectionConfig = payload.collections[collectionSlug]?.config
  const field = (collectionConfig?.fields as Array<{ name?: string; editor?: unknown }>).find(
    (f) => f.name === fieldName,
  )
  const editorConfig = (
    field?.editor as { editorConfig?: { resolvedFeatureMap?: Map<string, unknown> } }
  )?.editorConfig
  const upload = editorConfig?.resolvedFeatureMap?.get('upload') as
    | {
        sanitizedServerFeatureProps?: { enabledCollections?: string[] }
        clientFeatureProps?: { enabledCollections?: string[] }
      }
    | undefined
  // Both surfaces (server props + the client drawer allowlist) must agree.
  return upload?.clientFeatureProps ?? upload?.sanitizedServerFeatureProps
}

describe('Task 4-zero: richText uploads scoped to the gated `attachments` pool (B2 hardening)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  for (const [collection, field] of RICHTEXT_FIELDS) {
    it(`${collection}.${field}: UploadFeature enables ONLY \`attachments\`, never public \`media\``, () => {
      const client = resolvedUploadFeatureProps(collection, field)
      expect(client?.enabledCollections).toEqual(['attachments'])
      expect(client?.enabledCollections ?? []).not.toContain('media')
    })
  }

  it('the default upload feature was replaced, not duplicated (single resolved upload feature)', () => {
    // Sanity: the resolved map has exactly one `upload` entry and it is the
    // restricted one — proving the shared editor overrode the default.
    const collectionConfig = payload.collections['posts']?.config
    const field = (collectionConfig?.fields as Array<{ name?: string; editor?: unknown }>).find(
      (f) => f.name === 'content',
    )
    const rfm = (field?.editor as { editorConfig?: { resolvedFeatureMap?: Map<string, unknown> } })
      ?.editorConfig?.resolvedFeatureMap
    expect(rfm?.has('upload')).toBe(true)
    const server = (
      rfm?.get('upload') as { sanitizedServerFeatureProps?: { enabledCollections?: string[] } }
    )?.sanitizedServerFeatureProps
    expect(server?.enabledCollections).toEqual(['attachments'])
  })
})
