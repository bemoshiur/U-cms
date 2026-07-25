import { extname } from 'path'
import type { CollectionBeforeValidateHook, CollectionConfig, Field } from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync, isSuperUser } from '../../access/hasMenuAccess'
import { getAssignedTenantIds, tenantScopedMenuAccess } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { containsProfanity, extractLexicalText } from '../../content/wordFilter'
import type { BoardTypeKind } from '../boards/defaults'
import { toRelationId } from '../utils'
import { POST_CATEGORY_SLOTS, POSTS_MENU_KEY, REQUIRED_ENFORCED_FIELD_KEYS } from './defaults'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const postsAudit = auditCollection(POSTS_MENU_KEY)

/** A generic, slur-free rejection message for the profanity gate (never echoes the word). */
const PROFANITY_MESSAGE =
  'This content contains words that are not allowed by the site profanity policy. Please revise and resubmit.'

/** Parses a board's `attachmentAllowedExtensions` ("hwp,pdf,png") into a lowercase list. */
function parseAllowedExtensions(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return []
  }
  return value
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)
}

/**
 * A machine-managed numeric counter (fileSn / downloadCount). Deliberately
 * NOT field-access-locked: the hook/endpoint set these values, and a
 * `create/update:()=>false` field access would STRIP them from any non-override
 * admin write — renumbering fileSn and zeroing downloadCount on every edit. It
 * is `admin.readOnly` (UI-only) instead; the collection is gated on
 * `content.posts`, so only authorized admins can touch posts at all, and these
 * are display counters, not a security boundary.
 */
function counterField(name: string, description: string): Field {
  return {
    name,
    type: 'number',
    defaultValue: 0,
    admin: { readOnly: true, description },
  }
}

/**
 * The one config-driven gate for `posts` (Task 3B Part 1). Loads the post's
 * board and applies every server-side invariant:
 *
 *  1. Denormalizes `boardKind` (drives admin-UI conditions + kind behavior).
 *  2. Derives `tenant` from the board (a post ALWAYS inherits its board's site)
 *     and enforces tenant membership on create — the reusable T3A pattern:
 *     Payload's access `Where` covers read/update/delete but NOT create, so a
 *     crafted create with another site's board is rejected here.
 *  3. Enforces `requiredFlag` for the board's field-grid rows we persist,
 *     category `requiredFlag`, and category value↔group membership.
 *  4. Enforces attachment constraints (enabled / maxCount / allowed extensions
 *     / maxSize), the at-most-one-representative rule (auto-selects the first
 *     for photo boards), assigns each attachment a stable `fileSn`, and seeds
 *     `downloadCount`.
 *  5. Derives `isAnswered` (qna) from answer presence.
 *  6. Rejects any ACTIVE profanity word in the post's text (title/body/extra/
 *     answer) — with a policy message that never echoes the matched word.
 *
 * Skipped entirely when `req.context.skipPostSideEffects` is set — the download
 * endpoint uses that to bump a counter without re-running validation.
 *
 * Runs in `beforeValidate` (collection) so the derived `tenant`/`boardKind`/
 * `fileSn` are present before the fields' own `required`/validation run (the
 * same phase `boards`/`codes` use — see Boards.ts).
 */
const validatePostAgainstBoard: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data || req.context?.skipPostSideEffects) {
    return data
  }

  const eff = (key: string): unknown =>
    key in data ? (data as Record<string, unknown>)[key] : originalDoc?.[key]

  const boardId = toRelationId(eff('board'))
  if (boardId === undefined) {
    // `board` is required — let the field's own required validation reject it.
    return data
  }

  const board = await req.payload.findByID({
    collection: 'boards',
    id: boardId,
    depth: 1,
    overrideAccess: true,
    req,
    disableErrors: true,
  })
  if (!board) {
    throw new APIError('The referenced board does not exist.', 400)
  }

  const boardTenantId = toRelationId(board.tenant)
  const kind = (board.boardType as { kind?: BoardTypeKind } | null)?.kind
  data.boardKind = kind ?? null

  // ── (2) tenant inheritance + create-time membership guard ────────────────
  if (boardTenantId !== undefined) {
    data.tenant = boardTenantId
  }
  if (req.user && !isSuperUser(req.user) && boardTenantId !== undefined) {
    const assigned = getAssignedTenantIds(req.user)
    if (!assigned.some((id) => String(id) === String(boardTenantId))) {
      throw new APIError("You are not assigned to this post's board site (tenant).", 403)
    }
  }

  // ── (3) required field-grid rows ─────────────────────────────────────────
  const boardFields = Array.isArray(board.fields) ? board.fields : []
  for (const f of boardFields) {
    if (!f || f.useFlag !== true || f.requiredFlag !== true) {
      continue
    }
    const key = f.fieldKey
    const label = f.label || key
    if (key === 'attachment') {
      const atts = eff('attachments')
      if (!Array.isArray(atts) || atts.length === 0) {
        throw new APIError(`"${label}" is required for this board.`, 400)
      }
      continue
    }
    if (!(REQUIRED_ENFORCED_FIELD_KEYS as readonly string[]).includes(key)) {
      continue
    }
    const value = eff(key)
    const missing =
      key === 'department'
        ? toRelationId(value) === undefined
        : value === undefined || value === null || value === ''
    if (missing) {
      throw new APIError(`"${label}" is required for this board.`, 400)
    }
  }

  // ── (3b) categories — required per board + value must belong to the group ─
  const boardCats = Array.isArray(board.categories) ? board.categories : []
  for (let i = 0; i < POST_CATEGORY_SLOTS; i++) {
    const cat = boardCats[i]
    const chosenId = toRelationId(eff(`category${i + 1}`))
    if (chosenId === undefined) {
      if (cat?.useFlag === true && cat?.requiredFlag === true) {
        throw new APIError(
          `Category "${cat.title || `#${i + 1}`}" is required for this board.`,
          400,
        )
      }
      continue
    }
    if (!cat) {
      throw new APIError(`Category ${i + 1} is not configured for this board.`, 400)
    }
    const groupId = toRelationId(cat.classificationCode)
    const codeDoc = await req.payload.findByID({
      collection: 'codes',
      id: chosenId,
      depth: 0,
      overrideAccess: true,
      req,
      disableErrors: true,
    })
    if (codeDoc && groupId !== undefined && toRelationId(codeDoc.group) !== groupId) {
      throw new APIError(
        `The selected value for category ${i + 1} does not belong to this board's classification.`,
        400,
      )
    }
  }

  // ── (4) attachments: constraints + representative + fileSn + downloadCount ─
  const attsForValidation = eff('attachments')
  if (Array.isArray(attsForValidation) && attsForValidation.length > 0) {
    if (board.attachmentsEnabled !== true) {
      throw new APIError('Attachments are not enabled for this board.', 400)
    }
    const maxCount =
      typeof board.attachmentMaxCount === 'number' ? board.attachmentMaxCount : undefined
    if (maxCount !== undefined && attsForValidation.length > maxCount) {
      throw new APIError(
        `This board allows at most ${maxCount} attachment(s); received ${attsForValidation.length}.`,
        400,
      )
    }
    const reps = attsForValidation.filter(
      (a) => (a as { isRepresentative?: unknown })?.isRepresentative === true,
    )
    if (reps.length > 1) {
      throw new APIError('A post may have at most one representative attachment.', 400)
    }

    const allowed = parseAllowedExtensions(board.attachmentAllowedExtensions)
    const maxBytes =
      typeof board.attachmentMaxSizeMB === 'number'
        ? board.attachmentMaxSizeMB * 1024 * 1024
        : undefined
    for (const a of attsForValidation) {
      const mediaId = toRelationId((a as { media?: unknown })?.media)
      if (mediaId === undefined) {
        continue
      }
      const media = await req.payload.findByID({
        collection: 'media',
        id: mediaId,
        depth: 0,
        overrideAccess: true,
        req,
        disableErrors: true,
      })
      if (!media) {
        continue
      }
      if (allowed.length > 0 && typeof media.filename === 'string') {
        const ext = extname(media.filename).toLowerCase().replace(/^\./, '')
        if (!allowed.includes(ext)) {
          throw new APIError(`Attachment type ".${ext}" is not allowed for this board.`, 400)
        }
      }
      if (
        maxBytes !== undefined &&
        typeof media.filesize === 'number' &&
        media.filesize > maxBytes
      ) {
        throw new APIError(
          `An attachment exceeds this board's ${board.attachmentMaxSizeMB} MB size limit.`,
          400,
        )
      }
    }
  }

  // Mutations (fileSn / downloadCount / photo representative) only when the
  // write actually carries the attachments array.
  if (Array.isArray(data.attachments)) {
    // Preserve an existing, unique, positive fileSn (stable download URLs);
    // assign the next free positive integer to new/duplicate/unset rows.
    // `> 0` treats the field's default (0) as "unset" — the default is applied
    // in the earlier field phase, so a plain "typeof === number" check would
    // never fire.
    const used = new Set<number>()
    let next = 1
    for (const a of data.attachments) {
      const row = a as { fileSn?: unknown; downloadCount?: unknown }
      const sn = typeof row.fileSn === 'number' && row.fileSn > 0 ? row.fileSn : undefined
      if (sn !== undefined && !used.has(sn)) {
        used.add(sn)
      } else {
        while (used.has(next)) {
          next++
        }
        row.fileSn = next
        used.add(next)
        next++
      }
      if (typeof row.downloadCount !== 'number') {
        row.downloadCount = 0
      }
    }
    if (kind === 'photo' && data.attachments.length > 0) {
      const anyRep = data.attachments.some(
        (a) => (a as { isRepresentative?: unknown })?.isRepresentative === true,
      )
      if (!anyRep) {
        ;(data.attachments[0] as { isRepresentative?: boolean }).isRepresentative = true
      }
    }
  }

  // ── (5) qna: derive isAnswered from answer presence ──────────────────────
  data.isAnswered = extractLexicalText(eff('answer')).trim().length > 0

  // ── (6) profanity gate (never echoes the matched word) ───────────────────
  const activeProfanity = await req.payload.find({
    collection: 'profanityWords',
    where: { isActive: { equals: true } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (activeProfanity.docs.length > 0) {
    const text = [
      eff('title'),
      eff('author'),
      eff('team'),
      eff('extraField1'),
      eff('extraField2'),
      eff('extraField3'),
      eff('extraField4'),
      eff('extraContent1'),
      eff('extraContent2'),
      eff('extraContent3'),
      eff('extraContent4'),
      extractLexicalText(eff('content')),
      extractLexicalText(eff('answer')),
    ]
      .filter((v) => typeof v === 'string')
      .join(' ')
    if (containsProfanity(text, activeProfanity.docs)) {
      throw new APIError(PROFANITY_MESSAGE, 400)
    }
  }

  return data
}

function categoryField(index: number): Field {
  return {
    name: `category${index}`,
    type: 'relationship',
    relationTo: 'codes',
    admin: {
      description: `Category ${index} value — a detail code from the group bound to the board's category slot ${index}.`,
    },
  }
}

/**
 * Legacy 게시물 관리 (Post Management — refs 1-7, 1-28..1-35, 2-5..2-8). The
 * SINGLE collection for every board kind (legacy's one physical `tb_bbs`);
 * per-kind behavior is driven by the post's board's `boardType.kind`
 * (denormalized as `boardKind`), never separate collections — see
 * `POST_KIND_BEHAVIOR`.
 *
 * TENANT-SCOPED exactly like `boards`: opted into the multi-tenant plugin (adds
 * a required `tenant` → sites), gated on `content.posts` via
 * `tenantScopedMenuAccess`, with a create-time membership guard in
 * `beforeValidate`. A post's `tenant` is DERIVED from (and always equals) its
 * board's site.
 *
 * ## Content modes (Editor/HTML/TEXT) — deferred nuance
 *
 * `content` is a Lexical richText field. Legacy offered Editor / HTML / TEXT
 * input modes (plan §2.3); Lexical covers the Editor mode, and the HTML/TEXT
 * mode selection + raw-HTML sanitize-on-render is a Phase-4 rendering concern.
 */
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'board', 'author', 'isNotice', 'isSecret', 'createdAt'],
    hidden: ({ user }) => !hasMenuAccessSync(user, POSTS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(POSTS_MENU_KEY),
    read: tenantScopedMenuAccess(POSTS_MENU_KEY),
    update: tenantScopedMenuAccess(POSTS_MENU_KEY),
    delete: tenantScopedMenuAccess(POSTS_MENU_KEY),
  },
  fields: [
    {
      name: 'board',
      type: 'relationship',
      relationTo: 'boards',
      required: true,
      admin: { description: "The board this post belongs to — determines the post's config/kind." },
    },
    {
      name: 'boardKind',
      type: 'text',
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: "Denormalized board kind (auto-set from the board's type on save).",
      },
    },
    { name: 'title', type: 'text', required: true },
    {
      name: 'author',
      type: 'text',
      admin: { description: 'Display name of the author (legacy stored a free-text name).' },
    },
    {
      name: 'authorUser',
      type: 'relationship',
      relationTo: 'users',
      admin: { description: 'The admin/user who authored this post, if applicable.' },
    },
    { name: 'department', type: 'relationship', relationTo: 'departments' },
    { name: 'team', type: 'text' },
    {
      name: 'content',
      type: 'richText',
      admin: {
        description:
          'Post body (Editor mode). HTML/TEXT input modes + sanitize-on-render are a Phase-4 concern.',
      },
    },
    {
      name: 'viewCount',
      type: 'number',
      defaultValue: 0,
      // Not hook-set — locking write access here is safe and stops a client
      // from seeding an inflated view count.
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, description: 'Read count; incremented on detail view in Phase 4.' },
    },
    {
      name: 'isNotice',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Pinned notice post (공지). Optionally scoped to a date range below.' },
    },
    {
      name: 'noticeFrom',
      type: 'date',
      admin: { condition: (_d, sibling) => Boolean(sibling?.isNotice) },
    },
    {
      name: 'noticeTo',
      type: 'date',
      admin: { condition: (_d, sibling) => Boolean(sibling?.isNotice) },
    },
    {
      name: 'isSecret',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Secret (비공개) post — only its author + admins may view it.' },
    },
    categoryField(1),
    categoryField(2),
    categoryField(3),
    { name: 'extraField1', type: 'text' },
    { name: 'extraField2', type: 'text' },
    { name: 'extraField3', type: 'text' },
    { name: 'extraField4', type: 'text' },
    { name: 'extraContent1', type: 'textarea' },
    { name: 'extraContent2', type: 'textarea' },
    { name: 'extraContent3', type: 'textarea' },
    { name: 'extraContent4', type: 'textarea' },
    {
      name: 'attachments',
      type: 'array',
      labels: { singular: 'Attachment', plural: 'Attachments' },
      admin: {
        description:
          'Uploaded files. Constraints (count/size/extensions) come from the board; download via the managed endpoint (/api/files/download).',
      },
      fields: [
        { name: 'media', type: 'upload', relationTo: 'media', required: true },
        { name: 'description', type: 'text' },
        {
          name: 'isRepresentative',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'The gallery thumbnail (photo boards). At most one per post.' },
        },
        counterField('fileSn', 'Per-post file sequence, auto-assigned.'),
        counterField('downloadCount', 'Managed-download counter (see fileDownload.ts).'),
      ],
    },
    // ── Q&A behavior (kind qna, ref 1-33/2-8) ─────────────────────────────
    {
      name: 'answer',
      type: 'richText',
      admin: {
        condition: (_d, sibling) => sibling?.boardKind === 'qna',
        description: "Admin's answer to a Q&A question. Presence sets isAnswered.",
      },
    },
    {
      name: 'answeredBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { condition: (_d, sibling) => sibling?.boardKind === 'qna' },
    },
    {
      name: 'answeredAt',
      type: 'date',
      admin: { condition: (_d, sibling) => sibling?.boardKind === 'qna' },
    },
    {
      name: 'isAnswered',
      type: 'checkbox',
      defaultValue: false,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        condition: (_d, sibling) => sibling?.boardKind === 'qna',
        description: 'Derived: true once an answer is present.',
      },
    },
  ],
  hooks: {
    beforeValidate: [validatePostAgainstBoard],
    afterChange: [postsAudit.afterChange],
    afterDelete: [postsAudit.afterDelete],
  },
}
