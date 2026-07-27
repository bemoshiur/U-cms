import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { boardTypesStep } from '@/seed/steps/boardTypes'
import { sitesStep } from '@/seed/steps/sites'
import { ensureBoard } from '@/seed/steps/rich/boards'

/**
 * Task 7A #6 — `ensureBoard` override-collision merge. When a rich-seed board
 * name collides with a board the base seed already created, the helper must
 * MERGE the rich config onto the existing board (idempotent update) rather than
 * silently returning the existing id and DROPPING the overrides.
 */
let payload: Payload

function uniqueSiteId(label: string): string {
  return `re${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}

async function boardTypeId(code: string): Promise<number> {
  const found = await payload.find({
    collection: 'boardTypes',
    where: { code: { equals: code } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id
}

describe('Task 7A #6 — ensureBoard merges override config onto an existing board', () => {
  let tenantId: number
  let typeId: number
  const boardName = `MergeBoard-${Date.now()}`

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])
    const site = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('m'), name: 'Merge Site', url: 'https://merge.example.com' },
      overrideAccess: true,
    })
    tenantId = site.id
    typeId = await boardTypeId('PG0001')
  })

  it('creates on first call, then MERGES overrides on a colliding second call (idempotent)', async () => {
    // First call → create with a PLAIN base config (mirrors the base seed).
    const id = await ensureBoard(payload, tenantId, boardName, {
      boardType: typeId,
      boardForm: 'list',
      attachmentsEnabled: false,
      headerNotice: 'base notice',
    })

    // Second call, SAME (tenant,name) → must merge the richer config, NOT drop it.
    const idAgain = await ensureBoard(payload, tenantId, boardName, {
      boardType: typeId,
      boardForm: 'list',
      attachmentsEnabled: true,
      attachmentMaxCount: 5,
      headerNotice: 'rich notice',
    })
    expect(idAgain).toBe(id) // same board, not a duplicate

    const merged = await payload.findByID({ collection: 'boards', id, overrideAccess: true })
    // Fails WITHOUT the merge (the pre-fix helper returned early, leaving the
    // base config: attachmentsEnabled=false, no attachmentMaxCount, 'base notice').
    expect(merged.attachmentsEnabled).toBe(true)
    expect(merged.attachmentMaxCount).toBe(5)
    expect(merged.headerNotice).toBe('rich notice')

    // Third identical call → still idempotent (same id, same merged values).
    const idThird = await ensureBoard(payload, tenantId, boardName, {
      boardType: typeId,
      boardForm: 'list',
      attachmentsEnabled: true,
      attachmentMaxCount: 5,
      headerNotice: 'rich notice',
    })
    expect(idThird).toBe(id)
    const still = await payload.findByID({ collection: 'boards', id, overrideAccess: true })
    expect(still.headerNotice).toBe('rich notice')
    expect(still.attachmentMaxCount).toBe(5)
  })
})
