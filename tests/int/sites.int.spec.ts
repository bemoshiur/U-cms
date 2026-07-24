import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { SEED_SITES, sitesStep } from '@/seed/steps/sites'

let payload: Payload

/**
 * Generates a fresh, regex-valid `siteId` per test (lowercase-alphanumeric
 * only) so repeated test runs against a persistent dev DB never collide on
 * the collection's unique `siteId` index.
 */
function uniqueSiteId(label: string): string {
  return `test${label}${Date.now()}${Math.floor(Math.random() * 10000)}`
}

describe('sites collection', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('enforces siteId uniqueness', async () => {
    const siteId = uniqueSiteId('uniq')

    await payload.create({
      collection: 'sites',
      data: { siteId, name: 'Unique Test Site', url: 'https://example.com' },
      overrideAccess: true,
    })

    await expect(
      payload.create({
        collection: 'sites',
        data: { siteId, name: 'Duplicate Test Site', url: 'https://example.com' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects a siteId that is not lowercase alphanumeric', async () => {
    await expect(
      payload.create({
        collection: 'sites',
        data: { siteId: 'Bad-ID', name: 'Bad Format Site', url: 'https://example.com' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  // A custom field `validate` replaces Payload's default required-checking
  // validator entirely (see the comment on validateSiteId/validateUrl in
  // src/collections/Sites.ts) — these two guard against silently accepting
  // an empty string or a missing key, which Postgres NOT NULL alone would
  // not catch (an empty string still satisfies NOT NULL).
  it('rejects an empty-string siteId', async () => {
    await expect(
      payload.create({
        collection: 'sites',
        data: { siteId: '', name: 'Empty Site ID', url: 'https://example.com' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects a missing siteId', async () => {
    await expect(
      payload.create({
        collection: 'sites',
        // Intentionally omits the required `siteId` — TS would normally
        // block this, but a real REST/GraphQL caller isn't type-checked,
        // so the runtime guard must still catch it.
        data: { name: 'Missing Site ID', url: 'https://example.com' } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects a url with no scheme', async () => {
    await expect(
      payload.create({
        collection: 'sites',
        data: {
          siteId: uniqueSiteId('nourl'),
          name: 'No Scheme Site',
          url: 'example.com',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects an empty-string url', async () => {
    await expect(
      payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('emptyurl'), name: 'Empty URL Site', url: '' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects a missing url', async () => {
    await expect(
      payload.create({
        collection: 'sites',
        // Intentionally omits the required `url` — see the missing-siteId
        // test above for why this needs a cast.
        data: { siteId: uniqueSiteId('nourlkey'), name: 'Missing URL' } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('accepts a valid https:// url', async () => {
    const siteId = uniqueSiteId('validurl')

    const created = await payload.create({
      collection: 'sites',
      data: { siteId, name: 'Valid URL Site', url: 'https://example.com' },
      overrideAccess: true,
    })

    expect(created.url).toBe('https://example.com')
  })

  it('seeds the bos/demo sites idempotently', async () => {
    // Run twice — the second run must find the existing sites and skip
    // creation rather than erroring on the unique siteId constraint.
    await runSeed(payload, [sitesStep])
    await runSeed(payload, [sitesStep])

    const found = await payload.find({
      collection: 'sites',
      where: { siteId: { in: SEED_SITES.map((site) => site.siteId) } },
      limit: 10,
      pagination: false,
      overrideAccess: true,
    })

    expect(found.docs).toHaveLength(SEED_SITES.length)

    const bySiteId = new Map(found.docs.map((doc) => [doc.siteId, doc]))
    for (const seedSite of SEED_SITES) {
      const doc = bySiteId.get(seedSite.siteId)
      expect(doc).toBeDefined()
      expect(doc?.name).toBe(seedSite.name)
      expect(doc?.url).toBe(seedSite.url)
      expect(doc?.isAdminSite).toBe(seedSite.isAdminSite)
    }
  })

  it('persists per-item footer show/hide flags', async () => {
    const siteId = uniqueSiteId('footer')

    const created = await payload.create({
      collection: 'sites',
      data: {
        siteId,
        name: 'Footer Test Site',
        url: 'https://example.com',
        footer: {
          orgName: { value: 'Test Org', show: false },
          phone: { value: '02-000-0000', show: true },
        },
      },
      overrideAccess: true,
    })

    expect(created.footer?.orgName?.value).toBe('Test Org')
    expect(created.footer?.orgName?.show).toBe(false)
    expect(created.footer?.phone?.value).toBe('02-000-0000')
    expect(created.footer?.phone?.show).toBe(true)
    // Untouched footer items still get their `show` default (true).
    expect(created.footer?.fax?.show).toBe(true)

    const fetched = await payload.findByID({
      collection: 'sites',
      id: created.id,
      overrideAccess: true,
    })

    expect(fetched.footer?.orgName?.value).toBe('Test Org')
    expect(fetched.footer?.orgName?.show).toBe(false)
    expect(fetched.footer?.phone?.show).toBe(true)
  })
})
