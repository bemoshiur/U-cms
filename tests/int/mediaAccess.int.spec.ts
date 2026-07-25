import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { classifyAdminPath } from '@/security/adminIpEnforcement'

/**
 * B2 regression (phase-3-final-review §2) — INTERIM media read gate.
 *
 * `media.read` was `() => true` (fully public, no auth, no tenant) AND
 * `/api/media/file/*` was exempt from the admin IP guard. In Phase 3 `media`
 * also holds secret + cross-tenant board attachments (`Posts.attachments[]`),
 * so an unauthenticated caller could list every tenant's files via `/api/media`
 * and stream any file via `/api/media/file/<filename>`.
 *
 * INTERIM FIX (closes the UNAUTHENTICATED vector; full tenant/secret-aware fix
 * is Phase 4 T-zero):
 *   1. `media.read` now requires an authenticated user — the same access fn
 *      gates `/api/media` (list), `/api/media/<id>`, AND `/api/media/file/*`.
 *   2. `/api/media/file` removed from `EXEMPT_API_PREFIXES` → also behind the IP guard.
 *
 * These tests FAIL without the fix:
 *   - with `read: () => true`, the unauthenticated list returns the media doc, and
 *   - with the route still exempt, `classifyAdminPath('/api/media/file/...')` is `exempt`.
 */

let payload: Payload

const TEST_PASSWORD = 'a-long-enough-test-password-1'
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

function marker(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

describe('B2: media reads require authentication (interim gate)', () => {
  let mediaId: number
  let mediaFilename: string
  let adminUser: Awaited<ReturnType<typeof payload.create>>

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])

    const name = `${marker('secret-attachment')}.png`
    const created = await payload.create({
      collection: 'media',
      data: { alt: name },
      file: { data: PNG_1x1, name, mimetype: 'image/png', size: PNG_1x1.length },
      overrideAccess: true,
    })
    mediaId = created.id
    mediaFilename = created.filename as string

    // Any authenticated user is sufficient for the interim gate (read =
    // Boolean(req.user)); a super role keeps setup independent of menu grants.
    const superRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_B2_SUPER_${Date.now()}`,
        name: 'B2 super role',
        description: 'isSuper for B2 tests.',
        isSuper: true,
      },
      overrideAccess: true,
    })
    adminUser = await payload.create({
      collection: 'users',
      data: {
        email: `b2-admin-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
        password: TEST_PASSWORD,
        roles: [superRole.id],
        status: 'active',
      },
      overrideAccess: true,
    })
  })

  it('UNAUTHENTICATED list (/api/media) is denied', async () => {
    // With `read: ({ req }) => Boolean(req.user)`, an anonymous list is refused
    // (Payload throws Forbidden when read access resolves to `false`). Without
    // the fix (`read: () => true`) this call resolves and returns the doc.
    await expect(
      payload.find({
        collection: 'media',
        overrideAccess: false, // no `user` → read access sees no req.user
        limit: 0,
        pagination: false,
      }),
    ).rejects.toThrow()
  })

  it('UNAUTHENTICATED read-by-id (/api/media/:id) is denied — throws', async () => {
    // The `/api/media/file/<filename>` route runs this same `read` access, so a
    // denied unauthenticated read-by-id proves the file route denies anon too.
    await expect(
      payload.findByID({
        collection: 'media',
        id: mediaId,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('an AUTHENTICATED admin still can list and read media (behavior preserved)', async () => {
    const list = await payload.find({
      collection: 'media',
      overrideAccess: false,
      user: adminUser,
      limit: 0,
      pagination: false,
    })
    expect(list.docs.map((d) => d.id)).toContain(mediaId)

    const byId = await payload.findByID({
      collection: 'media',
      id: mediaId,
      overrideAccess: false,
      user: adminUser,
    })
    expect(byId.id).toBe(mediaId)
    expect(byId.filename).toBe(mediaFilename)
  })

  it('the media FILE route is now behind the admin IP guard (no longer exempt)', async () => {
    // Without the fix this classified as `exempt`.
    expect(classifyAdminPath(`/api/media/file/${mediaFilename}`)).toBe('guard')
    // The collection REST endpoints were already guarded — still are.
    expect(classifyAdminPath('/api/media')).toBe('guard')
    expect(classifyAdminPath(`/api/media/${mediaId}`)).toBe('guard')
  })
})
