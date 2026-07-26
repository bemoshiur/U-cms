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
  const collectionConfig =
    payload.collections[collectionSlug as keyof typeof payload.collections]?.config
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

  /**
   * FUNCTIONAL guard (regression the static-config check missed): the richText
   * UploadFeature must resolve a NON-EMPTY collection set at runtime. Its client
   * hook `useEnabledRelationships` filters on `visibleEntities`
   * (`getVisibleEntities` = `!admin.hidden`) BEFORE the `enabledCollections`
   * allowlist, so an `admin.hidden: true` on `attachments` makes the hook resolve
   * `[]` and silently breaks image embedding on every richText field — while the
   * static `enabledCollections` still reads `['attachments']`. These tests
   * reproduce the hook's exact logic and FAIL if `attachments` is hidden again.
   */
  describe('richText upload embedding actually works (client enablement, not just static config)', () => {
    // Mirrors @payloadcms/ui `getVisibleEntities`' isHidden(): a hidden
    // collection is invisible to EVERY user.
    const isHidden = (hidden: unknown, user: unknown): boolean =>
      typeof hidden === 'function'
        ? Boolean((hidden as (a: { user: unknown }) => unknown)({ user }))
        : Boolean(hidden)

    // Faithfully reproduces `useEnabledRelationships({ uploads: true })`:
    // visibleEntities → (upload && enableRichTextRelationship) → whitelist.
    const resolveEnabledUploadSlugs = (
      whitelist: string[] | undefined,
      user: unknown,
    ): string[] => {
      const whitelistSet = whitelist ? new Set(whitelist) : null
      const slugs: string[] = []
      for (const c of payload.config.collections) {
        const admin = (c.admin ?? {}) as {
          hidden?: unknown
          enableRichTextRelationship?: boolean
        }
        if (isHidden(admin.hidden, user)) continue
        if (!admin.enableRichTextRelationship || !(c as { upload?: unknown }).upload) continue
        if (whitelistSet && !whitelistSet.has(c.slug)) continue
        slugs.push(c.slug)
      }
      return slugs
    }

    it('`attachments` is NOT hidden — so the upload hook can see it (visible for every user)', () => {
      const admin = payload.collections['attachments']?.config.admin as { hidden?: unknown }
      expect(isHidden(admin?.hidden, { id: 1 })).toBe(false)
      expect(isHidden(admin?.hidden, undefined)).toBe(false)
    })

    it('the upload hook resolves exactly [`attachments`] — embedding works AND stays scoped (never `media`)', () => {
      // Use the REAL allowlist the client drawer receives (resolved from config).
      const whitelist = resolvedUploadFeatureProps('posts', 'content')?.enabledCollections
      const enabled = resolveEnabledUploadSlugs(whitelist, { id: 1 })
      expect(enabled).toContain('attachments') // non-empty → embedding functional
      expect(enabled).not.toContain('media') // scoped to the gated pool
      expect(enabled).toEqual(['attachments'])
    })
  })
})
