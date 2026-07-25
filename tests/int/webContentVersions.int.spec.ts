import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'

/**
 * B1 regression (phase-3-final-review §2) — WebContents version reads MUST be
 * tenant-scoped.
 *
 * `WebContents` is the only tenant-scoped collection with versions enabled.
 * Payload gates `findVersions` / `findVersionByID` on the SEPARATE
 * `readVersions` access key. If it is omitted, the multi-tenant plugin wrapper
 * degrades to `Boolean(req.user)` (because `userHasAccessToAllTenants: () =>
 * true` makes the wrapper a pass-through), so ANY authenticated admin reads
 * EVERY tenant's draft + historical snapshots. The fix adds
 * `readVersions: tenantScopedMenuAccess(WEB_CONTENTS_MENU_KEY, 'version.tenant')`.
 *
 * These tests are designed to FAIL:
 *   - if `readVersions` is REMOVED (a Site-A admin then sees Site-B versions), and
 *   - if `readVersions` is pointed at the WRONG path (`tenant` instead of
 *     `version.tenant`): a top-level `tenant` key does not exist on a version
 *     row, so the query either throws or silently drops the filter and
 *     re-leaks — either way the "sees A, not B" assertions below break.
 *
 * They also confirm a super user still sees ALL versions and that
 * `restoreVersion` (which reads a version) still works.
 */

let payload: Payload

const TEST_PASSWORD = 'a-long-enough-test-password-1'

function marker(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}
function uniqueSiteId(label: string): string {
  return `t${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}
function lettersOnly(): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  let out = ''
  while (n > 0) {
    out += String.fromCharCode(97 + (n % 26))
    n = Math.floor(n / 26)
  }
  return out
}
function lexical(text: string) {
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: [
        {
          type: 'paragraph',
          format: '' as const,
          indent: 0,
          version: 1,
          direction: 'ltr' as const,
          children: [
            { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 },
          ],
        },
      ],
    },
  }
}

async function adminMenuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (id === undefined) {
    throw new Error(`adminMenu ${menuKey} not seeded`)
  }
  return id
}

/** Creates a webContent on `siteId` with two versions (title v1 → v2). */
async function makeVersionedWebContent(
  siteId: number,
  label: string,
): Promise<{ id: number; menuId: number }> {
  const menu = await payload.create({
    collection: 'menus',
    data: { tenant: siteId, name: marker(`${label}Menu`), contentType: 'content' },
    overrideAccess: true,
  })
  const wc = await payload.create({
    collection: 'webContents',
    data: {
      menu: menu.id,
      name: label,
      title: `${label} v1`,
      content: lexical(`${label} body one`),
    },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'webContents',
    id: wc.id,
    data: { title: `${label} v2`, content: lexical(`${label} body two`) },
    overrideAccess: true,
  })
  return { id: wc.id, menuId: menu.id }
}

describe('B1: WebContents version reads are tenant-scoped (readVersions)', () => {
  let siteAId: number
  let siteBId: number
  let scopedAUser: Awaited<ReturnType<typeof payload.create>>
  let scopedBUser: Awaited<ReturnType<typeof payload.create>>
  let superUser: Awaited<ReturnType<typeof payload.create>>
  let wcAId: number
  let wcBId: number

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])

    const siteA = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('vera'), name: 'Versions A', url: 'https://va.example.com' },
      overrideAccess: true,
    })
    const siteB = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('verb'), name: 'Versions B', url: 'https://vb.example.com' },
      overrideAccess: true,
    })
    siteAId = siteA.id
    siteBId = siteB.id

    const grantIds = [await adminMenuId('content.webContents'), await adminMenuId('content.menus')]

    const roleA = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_B1_A_${lettersOnly().toUpperCase()}`,
        name: 'B1 role A',
        description: 'content.webContents (non-super), site A.',
        menuGrants: grantIds,
      },
      overrideAccess: true,
    })
    const roleB = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_B1_B_${lettersOnly().toUpperCase()}`,
        name: 'B1 role B',
        description: 'content.webContents (non-super), site B.',
        menuGrants: grantIds,
      },
      overrideAccess: true,
    })
    scopedAUser = await payload.create({
      collection: 'users',
      data: {
        email: `b1-a-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
        password: TEST_PASSWORD,
        roles: [roleA.id],
        tenants: [{ tenant: siteAId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    scopedBUser = await payload.create({
      collection: 'users',
      data: {
        email: `b1-b-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
        password: TEST_PASSWORD,
        roles: [roleB.id],
        tenants: [{ tenant: siteBId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })

    const superRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_B1_SUPER_${lettersOnly().toUpperCase()}`,
        name: 'B1 super role',
        description: 'isSuper for B1 tests.',
        isSuper: true,
      },
      overrideAccess: true,
    })
    superUser = await payload.create({
      collection: 'users',
      data: {
        email: `b1-super-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
        password: TEST_PASSWORD,
        roles: [superRole.id],
        status: 'active',
      },
      overrideAccess: true,
    })

    wcAId = (await makeVersionedWebContent(siteAId, 'SiteAContent')).id
    wcBId = (await makeVersionedWebContent(siteBId, 'SiteBContent')).id
  })

  /** Parent doc ids present in a `findVersions` result (as strings). */
  function parentIds(res: Awaited<ReturnType<Payload['findVersions']>>): Set<string> {
    return new Set(res.docs.map((d) => String(toRelationId(d.parent) ?? d.parent)))
  }

  it('a Site-A admin sees Site-A versions but NOT Site-B versions', async () => {
    const res = await payload.findVersions({
      collection: 'webContents',
      overrideAccess: false,
      user: scopedAUser,
      limit: 0,
      pagination: false,
    })
    const parents = parentIds(res)
    // Sees its own site's versions...
    expect(parents.has(String(wcAId))).toBe(true)
    // ...and MUST NOT see the other tenant's draft/historical versions (the leak).
    expect(parents.has(String(wcBId))).toBe(false)
    // Belt: every returned snapshot's tenant is Site A.
    for (const v of res.docs) {
      expect(String(toRelationId((v.version as { tenant?: unknown }).tenant))).toBe(String(siteAId))
    }
  })

  it('a Site-B admin sees Site-B versions but NOT Site-A versions (symmetry)', async () => {
    const res = await payload.findVersions({
      collection: 'webContents',
      overrideAccess: false,
      user: scopedBUser,
      limit: 0,
      pagination: false,
    })
    const parents = parentIds(res)
    expect(parents.has(String(wcBId))).toBe(true)
    expect(parents.has(String(wcAId))).toBe(false)
  })

  it('a super user still sees versions from ALL tenants', async () => {
    const res = await payload.findVersions({
      collection: 'webContents',
      overrideAccess: false,
      user: superUser,
      limit: 0,
      pagination: false,
    })
    const parents = parentIds(res)
    expect(parents.has(String(wcAId))).toBe(true)
    expect(parents.has(String(wcBId))).toBe(true)
  })

  it('findVersionByID is also scoped: a Site-A admin cannot read a Site-B version by id', async () => {
    // Grab a Site-B version id via an override read.
    const bVersions = await payload.findVersions({
      collection: 'webContents',
      where: { parent: { equals: wcBId } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const bVersionId = bVersions.docs[0]!.id
    await expect(
      payload.findVersionByID({
        collection: 'webContents',
        id: bVersionId,
        overrideAccess: false,
        user: scopedAUser,
      }),
    ).rejects.toThrow()

    // Sanity: the same admin CAN read one of its OWN site's versions by id.
    const aVersions = await payload.findVersions({
      collection: 'webContents',
      where: { parent: { equals: wcAId } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const aVersionId = aVersions.docs[0]!.id
    const own = await payload.findVersionByID({
      collection: 'webContents',
      id: aVersionId,
      overrideAccess: false,
      user: scopedAUser,
    })
    expect(String(toRelationId(own.parent) ?? own.parent)).toBe(String(wcAId))
  })

  it('restoreVersion still works (scoping does not break version restore)', async () => {
    const aVersions = await payload.findVersions({
      collection: 'webContents',
      where: { parent: { equals: wcAId } },
      sort: 'createdAt',
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    const oldest = aVersions.docs[0]!
    await payload.restoreVersion({
      collection: 'webContents',
      id: oldest.id,
      overrideAccess: true,
    })
    const current = await payload.findByID({
      collection: 'webContents',
      id: wcAId,
      overrideAccess: true,
    })
    expect(current.title).toBe('SiteAContent v1')
  })
})
