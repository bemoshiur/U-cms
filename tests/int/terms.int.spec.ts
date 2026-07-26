import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { loadActiveTerms, loadTermsHistory } from '@/site/terms'
import { resolveActiveTermsVersion } from '@/members/terms'
import { submitMemberSignup } from '@/members/signup'

/**
 * Task 4E — versioned privacy/terms (refs 2-14..2-16). Covers: one-active
 * (published) version + restore + published history; drafts never shown
 * publicly; the B1 readVersions tenant scoping; tenant read scoping; the
 * (tenant, category) uniqueness; and the CLOSED T4B consent seam (a signup
 * snapshots the REAL active terms version id).
 */

let payload: Payload

const TEST_PASSWORD = 'a-long-enough-test-password-1'

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

async function makeSite(admin = false): Promise<number> {
  const site = await payload.create({
    collection: 'sites',
    data: {
      siteId: uniqueSiteId('terms'),
      name: 'Terms Test Site',
      url: 'https://terms.example.com',
      isAdminSite: admin,
    },
    overrideAccess: true,
  })
  return site.id
}

describe('termsDocuments: versioning + scoping + consent seam (Task 4E)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])
  })

  it('one ACTIVE (published) version; restore re-activates a prior one; drafts never shown', async () => {
    const siteId = await makeSite()
    const doc = await payload.create({
      collection: 'termsDocuments',
      data: {
        tenant: siteId,
        category: 'termsOfUse',
        title: 'Terms v1',
        content: lexical('Body one'),
        _status: 'published',
      } as never,
      overrideAccess: true,
    })
    // find() returns the published/active version.
    let active = await loadActiveTerms(payload, siteId, 'termsOfUse')
    expect(active?.title).toBe('Terms v1')

    // New published version → it becomes the active one.
    await payload.update({
      collection: 'termsDocuments',
      id: doc.id,
      data: { title: 'Terms v2', content: lexical('Body two'), _status: 'published' } as never,
      overrideAccess: true,
    })
    active = await loadActiveTerms(payload, siteId, 'termsOfUse')
    expect(active?.title).toBe('Terms v2')

    // A DRAFT saved on top must NOT change the public active version.
    await payload.update({
      collection: 'termsDocuments',
      id: doc.id,
      data: { title: 'Terms v3 DRAFT', content: lexical('Draft body') } as never,
      draft: true,
      overrideAccess: true,
    })
    active = await loadActiveTerms(payload, siteId, 'termsOfUse')
    expect(active?.title).toBe('Terms v2')

    // Public history lists only the PUBLISHED versions (draft excluded), newest first.
    const history = await loadTermsHistory(payload, doc.id)
    const titles = history.map((h) => h.title)
    expect(titles).toContain('Terms v2')
    expect(titles).toContain('Terms v1')
    expect(titles).not.toContain('Terms v3 DRAFT')
    expect(history[0]?.title).toBe('Terms v2')
    expect(history[0]?.current).toBe(true)

    // Re-activate the ORIGINAL version (ref 2-16's 사용여부 변경).
    const published = await payload.findVersions({
      collection: 'termsDocuments',
      where: {
        and: [{ parent: { equals: doc.id } }, { 'version._status': { equals: 'published' } }],
      },
      sort: 'updatedAt',
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    const oldest = published.docs[0]!
    expect((oldest.version as { title?: string }).title).toBe('Terms v1')
    await payload.restoreVersion({
      collection: 'termsDocuments',
      id: oldest.id,
      overrideAccess: true,
    })
    active = await loadActiveTerms(payload, siteId, 'termsOfUse')
    expect(active?.title).toBe('Terms v1')
  })

  it('B3 — a terms doc CREATED as a draft (draft-from-start) is NEVER shown as the active policy', async () => {
    const siteId = await makeSite()
    // Draft FROM THE START — never published. Without the `_status:'published'`
    // filter, `find()` returns this draft row (its body sits in the main table
    // with `_status='draft'`) and it renders publicly as the active policy with
    // an empty change history. The prior test only covers draft-over-published.
    await payload.create({
      collection: 'termsDocuments',
      data: {
        tenant: siteId,
        category: 'termsOfUse',
        title: 'NEVER-PUBLISHED-TERMS',
        content: lexical('secret draft body'),
      } as never,
      draft: true,
      overrideAccess: true,
    })
    // No published version → the public loader returns null (route shows the
    // "not published yet" notice), NOT the draft.
    expect(await loadActiveTerms(payload, siteId, 'termsOfUse')).toBeNull()
  })

  it('enforces one document per (tenant, category)', async () => {
    const siteId = await makeSite()
    await payload.create({
      collection: 'termsDocuments',
      data: {
        tenant: siteId,
        category: 'other',
        title: 'A',
        content: lexical('a'),
        _status: 'published',
      } as never,
      overrideAccess: true,
    })
    await expect(
      payload.create({
        collection: 'termsDocuments',
        data: {
          tenant: siteId,
          category: 'other',
          title: 'B',
          content: lexical('b'),
          _status: 'published',
        } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('B1: version reads are tenant-scoped (readVersions on version.tenant)', async () => {
    const siteAId = await makeSite()
    const siteBId = await makeSite()

    const makeVersioned = async (siteId: number, label: string): Promise<number> => {
      const d = await payload.create({
        collection: 'termsDocuments',
        data: {
          tenant: siteId,
          category: 'thirdPartyProvision',
          title: `${label} v1`,
          content: lexical('one'),
          _status: 'published',
        } as never,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'termsDocuments',
        id: d.id,
        data: { title: `${label} v2`, content: lexical('two'), _status: 'published' } as never,
        overrideAccess: true,
      })
      return d.id
    }
    const docAId = await makeVersioned(siteAId, 'SiteA')
    const docBId = await makeVersioned(siteBId, 'SiteB')

    const grant = await adminMenuId('content.terms')
    const roleA = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_TERMS_A_${lettersOnly().toUpperCase()}`,
        name: 'terms A',
        description: 'content.terms grant, site A.',
        menuGrants: [grant],
      },
      overrideAccess: true,
    })
    const scopedA = await payload.create({
      collection: 'users',
      data: {
        email: `terms-a-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`,
        password: TEST_PASSWORD,
        roles: [roleA.id],
        tenants: [{ tenant: siteAId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })

    const res = await payload.findVersions({
      collection: 'termsDocuments',
      overrideAccess: false,
      user: scopedA,
      limit: 0,
      pagination: false,
    })
    const parents = new Set(res.docs.map((d) => String(toRelationId(d.parent) ?? d.parent)))
    expect(parents.has(String(docAId))).toBe(true)
    expect(parents.has(String(docBId))).toBe(false) // the B1 leak — must NOT see Site-B versions
    for (const v of res.docs) {
      expect(String(toRelationId((v.version as { tenant?: unknown }).tenant))).toBe(String(siteAId))
    }

    // Read scoping too: the Site-A admin's find sees only Site-A docs.
    const docs = await payload.find({
      collection: 'termsDocuments',
      overrideAccess: false,
      user: scopedA,
      limit: 0,
      pagination: false,
    })
    for (const d of docs.docs) {
      expect(String(toRelationId(d.tenant))).toBe(String(siteAId))
    }
  })

  it('closes the T4B consent seam: a signup snapshots the REAL active terms version id', async () => {
    // A public site with published Terms of Use + privacy terms.
    const site = await payload.create({
      collection: 'sites',
      data: {
        siteId: uniqueSiteId('signup'),
        name: 'Signup Site',
        url: 'https://signup.example.com',
        isAdminSite: false,
      },
      overrideAccess: true,
    })
    const termsOfUse = await payload.create({
      collection: 'termsDocuments',
      data: {
        tenant: site.id,
        category: 'termsOfUse',
        title: 'Terms of Use',
        content: lexical('tou'),
        _status: 'published',
      } as never,
      overrideAccess: true,
    })
    const privacy = await payload.create({
      collection: 'termsDocuments',
      data: {
        tenant: site.id,
        category: 'personalInfoProcessing',
        title: 'Privacy',
        content: lexical('priv'),
        _status: 'published',
      } as never,
      overrideAccess: true,
    })

    const expectedTou = await resolveActiveTermsVersion(payload, site.id, 'termsOfUse')
    const expectedPriv = await resolveActiveTermsVersion(payload, site.id, 'personalInfoProcessing')
    expect(expectedTou).not.toBeNull()
    expect(expectedPriv).not.toBeNull()

    const loginId = `t${lettersOnly()}`.slice(0, 14)
    const result = await submitMemberSignup(
      payload,
      {
        loginId,
        email: `${loginId}@example.com`,
        name: 'Consent Tester',
        password: 'Consent-Pass-99',
        confirmPassword: 'Consent-Pass-99',
        agreeService: 'on',
        agreePrivacy: 'on',
      },
      { siteId: site.siteId },
    )

    const member = await payload.findByID({
      collection: 'members',
      id: result.id,
      overrideAccess: true,
    })
    const consents = (member.termsConsents ?? []) as { category: string; version: string }[]
    const byCat = Object.fromEntries(consents.map((c) => [c.category, c.version]))
    expect(byCat.service).toBe(String(expectedTou))
    expect(byCat.privacy).toBe(String(expectedPriv))
    // Sanity: the versions reference the real published docs.
    expect(termsOfUse.id).toBeDefined()
    expect(privacy.id).toBeDefined()
  })
})
