import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { classifyAdminPath } from '@/security/adminIpEnforcement'

/**
 * Task 4-zero — `media` is the PUBLIC display-asset pool (criterion 4).
 *
 * The Phase-3 interim B2 fix made `media.read` require auth and guarded
 * `/api/media/file`, which closed the leak but ALSO made site logos
 * unreadable to the public site. Task 4-zero moved every access-controlled
 * attachment into the tenant-scoped `attachments` collection, so `media` holds
 * ONLY public assets and its read is public again — the deliberate public logo
 * path Phase 4 T4A needs. Attachment confidentiality is proven separately in
 * `attachmentAccess.int.spec.ts`.
 *
 * These assertions FAIL if `media.read` is re-closed to authenticated-only, or
 * if `/api/media/file` is dropped from the exempt list.
 */

let payload: Payload

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

function marker(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}
function uniqueSiteId(label: string): string {
  return `t${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}

describe('Task 4-zero: media is the public display-asset pool (site logos readable)', () => {
  let logoId: number
  let logoFilename: string

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])

    const name = `${marker('site-logo')}.png`
    const logo = await payload.create({
      collection: 'media',
      data: { alt: name },
      file: { data: PNG_1x1, name, mimetype: 'image/png', size: PNG_1x1.length },
      overrideAccess: true,
    })
    logoId = logo.id
    logoFilename = logo.filename as string

    // Attach the logo to a real site — the genuinely-public asset the public
    // site renders unauthenticated.
    await payload.create({
      collection: 'sites',
      data: {
        siteId: uniqueSiteId('logo'),
        name: 'Logo site',
        url: 'https://logo.example.com',
        logo: logoId,
      } as never,
      overrideAccess: true,
    })
  })

  it('an UNAUTHENTICATED caller CAN read a media doc (public logo path — criterion 4)', async () => {
    // `read: () => true`, so an anonymous list/read resolves (before Task 4-zero
    // the interim gate threw here). This is what lets T4A render a logo with no
    // session.
    const list = await payload.find({
      collection: 'media',
      overrideAccess: false, // no user
      limit: 0,
      pagination: false,
    })
    expect(list.docs.map((d) => d.id)).toContain(logoId)

    const byId = await payload.findByID({
      collection: 'media',
      id: logoId,
      overrideAccess: false, // no user — the /api/media/file route runs this same read
    })
    expect(byId.filename).toBe(logoFilename)
  })

  it('exposes the public media FILE route (exempt) but keeps the collection list guarded', () => {
    expect(classifyAdminPath(`/api/media/file/${logoFilename}`)).toBe('exempt')
    expect(classifyAdminPath('/api/media')).toBe('guard')
    expect(classifyAdminPath(`/api/media/${logoId}`)).toBe('guard')
  })
})
