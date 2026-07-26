import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * The four §3 security-document libraries (Task 6D; legacy ref 3-4). Per plan
 * §2.3 these are FOUR MOUNTED BOARDS — no new code: ordinary board-engine
 * records flagged `securityDoc: true`, so they are gated on
 * `privacy.securityDocs` (a privacy-role/super admin only — NOT a content
 * admin) via `securityDocScopedAccess`. All are attachment-enabled document
 * libraries (board type PG0006), on the demo site (tenant), each seeded with a
 * couple of example posts so the boards are not empty (demo-enrichment goal).
 *
 * English display names per the brief; the Korean legacy names are noted.
 * Idempotent: each board is looked up by (tenant, name) before create; each
 * post by (board, title).
 */

/** Board type code for the attachment (document-library) boards (ref 1-78). */
const SECURITY_DOC_BOARD_TYPE_CODE = 'PG0006'

export const SECURITY_DOC_BOARDS: {
  /** English display name (the board's `name`). */
  name: string
  /** Legacy Korean library name (documented only — not stored separately). */
  legacyName: string
  headerNotice: string
  /** Example posts seeded onto the board so it renders non-empty. */
  posts: { title: string; author: string; body: string }[]
}[] = [
  {
    name: 'Security Education',
    legacyName: '보안교육',
    headerNotice: 'Information-security training materials.',
    posts: [
      {
        title: '2025 Information Security Awareness Training',
        author: 'Privacy Officer',
        body: 'Annual security-awareness training deck and completion guidance for all staff.',
      },
      {
        title: 'Phishing Recognition Quick Guide',
        author: 'Privacy Officer',
        body: 'How to recognize and report suspected phishing and social-engineering attempts.',
      },
    ],
  },
  {
    name: 'Security Cases',
    legacyName: '보안사례',
    headerNotice: 'Security case studies and lessons learned.',
    posts: [
      {
        title: 'Case Study: Credential-Stuffing Response',
        author: 'Privacy Team',
        body: 'A walkthrough of a credential-stuffing incident and the containment steps taken.',
      },
      {
        title: 'Case Study: Lost Device Handling',
        author: 'Privacy Team',
        body: 'How a lost corporate device was remotely wiped and access revoked.',
      },
    ],
  },
  {
    name: 'Security Management Plan',
    legacyName: '개인정보 관리계획',
    headerNotice: 'The personal-information protection management plan.',
    posts: [
      {
        title: 'Personal-Information Protection Management Plan (v1)',
        author: 'Privacy Officer',
        body: 'The current management plan: safeguards, roles, and the annual review schedule.',
      },
      {
        title: 'Data-Retention and Disposal Schedule',
        author: 'Privacy Officer',
        body: 'Retention periods per data category and the secure-disposal procedure.',
      },
    ],
  },
  {
    name: 'Incident Response Guidelines',
    legacyName: '침해사고 대응지침',
    headerNotice: 'Personal-information breach incident-response guidelines.',
    posts: [
      {
        title: 'Personal-Information Breach Response Guidelines',
        author: 'Privacy Officer',
        body: 'Detection, containment, notification, and post-incident review steps for a breach.',
      },
      {
        title: 'Breach Notification Contact List',
        author: 'Privacy Officer',
        body: 'Who to contact (internal and regulatory) and within what timeframe on a breach.',
      },
    ],
  },
]

/** A minimal valid Lexical editor-state carrying a single paragraph of text. */
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

export const securityDocsStep: SeedStep = {
  name: 'security-docs',
  async run(payload: Payload) {
    const demoSite = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const demoSiteId = demoSite.docs[0]?.id
    if (demoSiteId === undefined) {
      throw new Error('[seed:security-docs] demo site not found — did sitesStep run first?')
    }

    const boardType = await payload.find({
      collection: 'boardTypes',
      where: { code: { equals: SECURITY_DOC_BOARD_TYPE_CODE } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const boardTypeId = boardType.docs[0]?.id
    if (boardTypeId === undefined) {
      throw new Error(
        `[seed:security-docs] board type ${SECURITY_DOC_BOARD_TYPE_CODE} not found — did boardTypesStep run first?`,
      )
    }

    for (const lib of SECURITY_DOC_BOARDS) {
      const existing = await payload.find({
        collection: 'boards',
        where: { and: [{ tenant: { equals: demoSiteId } }, { name: { equals: lib.name } }] },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })

      let boardId = existing.docs[0]?.id
      if (boardId === undefined) {
        const created = await payload.create({
          collection: 'boards',
          data: {
            tenant: demoSiteId,
            name: lib.name,
            boardType: boardTypeId,
            securityDoc: true,
            attachmentsEnabled: true,
            attachmentMaxCount: 5,
            attachmentMaxSizeMB: 10,
            boardForm: 'list',
            headerNotice: lib.headerNotice,
          },
          overrideAccess: true,
        })
        boardId = created.id
        payload.logger.info(
          `[seed:security-docs] created board "${lib.name}" (${lib.legacyName}) on demo site.`,
        )
      } else {
        payload.logger.info(`[seed:security-docs] board "${lib.name}" already exists — skipping.`)
      }

      for (const post of lib.posts) {
        const existingPost = await payload.find({
          collection: 'posts',
          where: { and: [{ board: { equals: boardId } }, { title: { equals: post.title } }] },
          limit: 1,
          pagination: false,
          overrideAccess: true,
        })
        if (existingPost.docs.length > 0) {
          payload.logger.info(
            `[seed:security-docs] post "${post.title}" already exists — skipping.`,
          )
          continue
        }
        await payload.create({
          collection: 'posts',
          data: {
            board: boardId,
            title: post.title,
            author: post.author,
            content: lexical(post.body),
          },
          overrideAccess: true,
        })
        payload.logger.info(`[seed:security-docs] created post "${post.title}".`)
      }
    }
  },
}
