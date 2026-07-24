import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { departmentsStep, SEED_DEPARTMENTS } from '@/seed/steps/departments'

let payload: Payload

/**
 * Generates a unique department name per test so repeated runs against a
 * persistent dev DB never collide (mirrors `uniqueSiteId` in
 * tests/int/sites.int.spec.ts).
 */
function uniqueName(label: string): string {
  return `test-${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

describe('departments collection', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('rejects an empty-string name', async () => {
    await expect(
      payload.create({
        collection: 'departments',
        data: { name: '' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects a missing name', async () => {
    await expect(
      payload.create({
        collection: 'departments',
        // Intentionally omits the required `name` — see the analogous
        // missing-siteId test in tests/int/sites.int.spec.ts for why this
        // needs a cast: a real REST/GraphQL caller isn't type-checked.
        data: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects setting a department as its own parent', async () => {
    const dept = await payload.create({
      collection: 'departments',
      data: { name: uniqueName('self-parent') },
      overrideAccess: true,
    })

    await expect(
      payload.update({
        collection: 'departments',
        id: dept.id,
        data: { parent: dept.id },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects setting a department parent to one of its own descendants', async () => {
    const grandparent = await payload.create({
      collection: 'departments',
      data: { name: uniqueName('cycle-grandparent') },
      overrideAccess: true,
    })
    const parent = await payload.create({
      collection: 'departments',
      data: { name: uniqueName('cycle-parent'), parent: grandparent.id },
      overrideAccess: true,
    })
    const child = await payload.create({
      collection: 'departments',
      data: { name: uniqueName('cycle-child'), parent: parent.id },
      overrideAccess: true,
    })

    // Attempt: grandparent's parent = child, i.e. one of its own
    // descendants — should be rejected as a cycle.
    await expect(
      payload.update({
        collection: 'departments',
        id: grandparent.id,
        data: { parent: child.id },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('allows re-parenting to an unrelated department (sanity check — not every update is rejected)', async () => {
    const deptA = await payload.create({
      collection: 'departments',
      data: { name: uniqueName('unrelated-a') },
      overrideAccess: true,
    })
    const deptB = await payload.create({
      collection: 'departments',
      data: { name: uniqueName('unrelated-b') },
      overrideAccess: true,
    })

    const updated = await payload.update({
      collection: 'departments',
      id: deptB.id,
      data: { parent: deptA.id },
      overrideAccess: true,
    })

    expect(
      typeof updated.parent === 'object' && updated.parent !== null
        ? updated.parent.id
        : updated.parent,
    ).toBe(deptA.id)
  })

  it('blocks deleting a department that has children', async () => {
    const parent = await payload.create({
      collection: 'departments',
      data: { name: uniqueName('delete-parent') },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'departments',
      data: { name: uniqueName('delete-child'), parent: parent.id },
      overrideAccess: true,
    })

    await expect(
      payload.delete({
        collection: 'departments',
        id: parent.id,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('allows deleting a leaf department', async () => {
    const leaf = await payload.create({
      collection: 'departments',
      data: { name: uniqueName('delete-leaf') },
      overrideAccess: true,
    })

    await expect(
      payload.delete({
        collection: 'departments',
        id: leaf.id,
        overrideAccess: true,
      }),
    ).resolves.toBeDefined()
  })

  it('seeds the baseline department tree idempotently', async () => {
    // Run twice — the second run must find the existing root/children and
    // skip creation rather than duplicating them.
    await runSeed(payload, [departmentsStep])
    await runSeed(payload, [departmentsStep])

    const roots = await payload.find({
      collection: 'departments',
      where: {
        and: [{ name: { equals: SEED_DEPARTMENTS.root.name } }, { parent: { exists: false } }],
      },
      limit: 10,
      pagination: false,
      overrideAccess: true,
    })
    expect(roots.docs).toHaveLength(1)

    const rootId = roots.docs[0]?.id
    expect(rootId).toBeDefined()

    const children = await payload.find({
      collection: 'departments',
      where: { parent: { equals: rootId } },
      limit: 10,
      pagination: false,
      overrideAccess: true,
    })
    expect(children.docs).toHaveLength(SEED_DEPARTMENTS.children.length)

    const names = children.docs.map((doc) => doc.name).sort()
    expect(names).toEqual(SEED_DEPARTMENTS.children.map((c) => c.name).sort())
  })
})
