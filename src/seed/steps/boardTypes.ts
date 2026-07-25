import type { Payload } from 'payload'

import type { BoardTypeKind } from '../../collections/boards/defaults'
import type { SeedStep } from '../types'

/**
 * Built-in board types (refs 1-77/1-78). Codes are pinned to the legacy PG
 * values (note the gaps: PG0005 and PG0007-PG0009 are intentionally absent —
 * they were other/custom legacy types). Admin-created types auto-increment
 * from the current max, so the first new one becomes PG0011.
 *
 * Exported so tests assert against the same source of truth (mirrors
 * `SEED_CODE_GROUPS`).
 */
export const SEED_BOARD_TYPES: {
  code: string
  name: string
  kind: BoardTypeKind
  description: string
}[] = [
  { code: 'PG0001', name: 'Integrated Board', kind: 'integrated', description: '통합게시판' },
  { code: 'PG0002', name: 'Photo/Gallery Board', kind: 'photo', description: '포토형게시판' },
  { code: 'PG0003', name: 'Q&A Board', kind: 'qna', description: '답변형게시판' },
  { code: 'PG0004', name: 'FAQ Board', kind: 'faq', description: 'FAQ게시판' },
  {
    code: 'PG0006',
    name: 'Attachment File Board',
    kind: 'attachment',
    description: '첨부파일게시판',
  },
  { code: 'PG0010', name: 'Extended Board', kind: 'extended', description: '확장형 게시판' },
]

/**
 * Seeds the six built-in board types (ref 1-78). Idempotent: each type is
 * looked up by its pinned `code` before create, so re-running never
 * duplicates. Passing `code` explicitly bypasses the auto-generator in
 * `BoardTypes.ts` (which only fires when `code` is absent).
 */
export const boardTypesStep: SeedStep = {
  name: 'board-types',
  async run(payload: Payload) {
    for (const type of SEED_BOARD_TYPES) {
      const existing = await payload.find({
        collection: 'boardTypes',
        where: { code: { equals: type.code } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })

      if (existing.docs.length > 0) {
        payload.logger.info(`[seed:board-types] "${type.code}" already exists — skipping.`)
        continue
      }

      await payload.create({
        collection: 'boardTypes',
        data: type,
        overrideAccess: true,
      })
      payload.logger.info(`[seed:board-types] created "${type.code}" (${type.name}).`)
    }
  },
}
