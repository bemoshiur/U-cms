import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * Example posts on the seeded boards so Task 3B tests + Phase 4 rendering have
 * content to work against (ref 2-5..2-8). Includes:
 *  - a pinned Notice post + a normal Notice post,
 *  - a Gallery post with a REPRESENTATIVE image attachment (the card thumbnail),
 *  - a Q&A post WITH an admin answer (isAnswered derives to true).
 *
 * Idempotent: each post is looked up by (board, title) before create.
 */

/** A minimal valid Lexical editor-state carrying a single paragraph of text. */
function lexical(text: string) {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: [
        {
          type: 'paragraph',
          format: '',
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

/** A tiny 1×1 transparent PNG for the seeded gallery representative image. */
const SEED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

async function boardIdByName(payload: Payload, tenantId: number, name: string): Promise<number> {
  const found = await payload.find({
    collection: 'boards',
    where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: name } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (id === undefined) {
    throw new Error(`[seed:posts] board "${name}" not found — did boardsStep run first?`)
  }
  return id
}

async function ensurePost(
  payload: Payload,
  boardId: number,
  title: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'posts',
    where: { and: [{ board: { equals: boardId } }, { title: { equals: title } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    payload.logger.info(`[seed:posts] post "${title}" already exists — skipping.`)
    return
  }
  await payload.create({
    collection: 'posts',
    data: { board: boardId, title, ...data },
    overrideAccess: true,
  })
  payload.logger.info(`[seed:posts] created post "${title}".`)
}

export const postsStep: SeedStep = {
  name: 'posts',
  async run(payload: Payload) {
    const demo = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const demoSiteId = demo.docs[0]?.id
    if (demoSiteId === undefined) {
      throw new Error('[seed:posts] demo site not found — did sitesStep run first?')
    }

    const noticeBoardId = await boardIdByName(payload, demoSiteId, 'Notice')
    const galleryBoardId = await boardIdByName(payload, demoSiteId, 'Gallery')
    const qnaBoardId = await boardIdByName(payload, demoSiteId, 'Q&A')

    // ── Notice board ─────────────────────────────────────────────────────
    await ensurePost(payload, noticeBoardId, 'Welcome to the Notice board', {
      author: 'Administrator',
      isNotice: true,
      content: lexical('This pinned notice welcomes visitors to the demo notice board.'),
    })
    await ensurePost(payload, noticeBoardId, 'Second notice', {
      author: 'Administrator',
      content: lexical('A regular (non-pinned) notice post.'),
    })

    // ── Gallery board — post with a REPRESENTATIVE image ──────────────────
    const galleryTitle = 'Sample gallery item'
    const galleryExists = await payload.find({
      collection: 'posts',
      where: { and: [{ board: { equals: galleryBoardId } }, { title: { equals: galleryTitle } }] },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (galleryExists.docs.length === 0) {
      // Task 4-zero: post attachments live in the tenant-scoped `attachments`
      // collection (not the public `media` pool). Seed the representative image
      // there, carrying the demo site's tenant so read-scoping applies.
      const image = await payload.create({
        collection: 'attachments',
        data: { alt: 'Seed gallery representative image', tenant: demoSiteId } as never,
        file: {
          data: Buffer.from(SEED_PNG_BASE64, 'base64'),
          name: `seed-gallery-${Date.now()}.png`,
          mimetype: 'image/png',
          size: Buffer.from(SEED_PNG_BASE64, 'base64').length,
        },
        overrideAccess: true,
      })
      await ensurePost(payload, galleryBoardId, galleryTitle, {
        author: 'Administrator',
        content: lexical('A gallery item whose representative image drives the card thumbnail.'),
        attachments: [
          { media: image.id, description: 'Representative image', isRepresentative: true },
        ],
      })
    } else {
      payload.logger.info(`[seed:posts] post "${galleryTitle}" already exists — skipping.`)
    }

    // ── Q&A board — question WITH an admin answer ─────────────────────────
    await ensurePost(payload, qnaBoardId, 'How do I request an account?', {
      author: 'Curious User',
      content: lexical('What is the process to request an administrator account?'),
      answer: lexical('Use the Account Request link on the login page; an admin approves it.'),
      answeredAt: new Date().toISOString(),
    })
  },
}
