import { extname } from 'path'
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
} from 'payload'
import { APIError } from 'payload'

import {
  hasMenuAccess,
  hasMenuAccessSync,
  isSuperUser,
  menuFieldAccess,
} from '../../access/hasMenuAccess'
import { SECURITY_DOCS_MENU_KEY, securityDocScopedAccess } from '../../access/securityDocs'
import { getAssignedTenantIds } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { postAttachmentRefIds } from '../../content/attachmentRefs'
import { containsProfanity, extractLexicalText } from '../../content/wordFilter'
import { downloadStatsEndpoints } from '../../endpoints/downloadStatsExport'
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

  // §3 security-document class (Task 6D; ref 3-4). Denormalized from the board
  // (like `boardKind`) so `posts` access can gate security-doc posts on
  // `privacy.securityDocs` without a relationship join — see the collection
  // `access` and src/access/securityDocs.ts.
  const boardIsSecurityDoc = board.securityDoc === true
  data.securityDoc = boardIsSecurityDoc

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

  // Security-document posts are §3: a non-super writer must hold
  // `privacy.securityDocs` to create/update a post under one of the four
  // security-doc libraries (the read gate already hides them; this closes the
  // write side so a content admin can't inject posts into a privacy library).
  if (boardIsSecurityDoc && req.user && !isSuperUser(req.user)) {
    if (!(await hasMenuAccess(req, SECURITY_DOCS_MENU_KEY))) {
      throw new APIError('You do not have permission to post to a security-document board.', 403)
    }
  }

  // §3 attachment cross-reference guard (Task 6D round-4; round-5 extends to ALL
  // reference sites). A NON-security-doc post may not reference an attachment
  // currently flagged `securityDoc` through ANY site — the `attachments[]` array
  // OR an upload node embedded in the `content`/`answer` richText — since that
  // would pull a §3 file into an ordinary post and (via the denorm sync) attempt
  // to re-expose it. Security-doc attachments belong ONLY to security-doc posts.
  // Rejected at the SOURCE so the shared-reference state never forms; the
  // recompute-any denorm sync is the backstop. Skipped for the privileged
  // board→posts flip (that path runs with `skipPostSideEffects`, short-circuited
  // above) and for security-doc posts themselves.
  if (!boardIsSecurityDoc) {
    const refIds = postAttachmentRefIds({
      attachments: eff('attachments'),
      content: eff('content'),
      answer: eff('answer'),
    })
    if (refIds.length > 0) {
      const secureRefs = await req.payload.find({
        collection: 'attachments',
        where: { and: [{ id: { in: refIds } }, { securityDoc: { equals: true } }] },
        depth: 0,
        limit: 1,
        pagination: false,
        overrideAccess: true,
        req,
      })
      if (secureRefs.docs.length > 0) {
        throw new APIError(
          'This attachment belongs to a security-document library and cannot be added to an ordinary post.',
          403,
        )
      }
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
        collection: 'attachments',
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

/**
 * Q&A answer attribution auto-stamp (Task 4B / carried Phase-3 seam D4). When a
 * write carries a non-empty `answer`, this stamps `answeredBy` from the ACTING
 * user (`req.user`) and `answeredAt` from the server clock, IGNORING any
 * client-supplied `answeredBy`/`answeredAt` — so attribution can never be forged.
 * Clearing the answer clears the attribution.
 *
 * ## Why this closes the seam (with the field-level access on the three fields)
 *
 * Before member posting existed, `answer`/`answeredBy`/`answeredAt` had NO
 * field-level access and no auto-stamp, so a Q&A questioner could forge an
 * answer or its author. Now: (1) those fields carry `menuFieldAccess('content.
 * posts')`, so ONLY a post-admin (or `overrideAccess`) can write them — a member
 * asking a question can't set them at all (stripped in the field phase); and
 * (2) this hook re-derives `answeredBy`/`answeredAt` server-side, so even a
 * post-admin cannot claim a different admin answered. `req.context.
 * skipPostSideEffects` (the download counter's bump) short-circuits it. When
 * there's no acting user (a system/`overrideAccess` write with no `req.user`,
 * e.g. seed), it leaves existing attribution untouched rather than nulling it.
 */
const stampAnswerAttribution: CollectionBeforeChangeHook = ({ data, req }) => {
  if (!data || req.context?.skipPostSideEffects) {
    return data
  }
  if (!('answer' in data)) {
    // Not touching the answer this write — never trust a client-supplied
    // attribution injected without an answer (field access already gates it,
    // but drop it defensively so it can never be set out-of-band).
    delete (data as Record<string, unknown>).answeredBy
    delete (data as Record<string, unknown>).answeredAt
    return data
  }
  const hasAnswer = extractLexicalText((data as Record<string, unknown>).answer).trim().length > 0
  if (!hasAnswer) {
    data.answeredBy = null
    data.answeredAt = null
    return data
  }
  const actorId = (req.user as { id?: number | string } | undefined)?.id
  if (actorId !== undefined) {
    data.answeredBy = actorId
    data.answeredAt = new Date().toISOString()
  }
  // No acting user (system/overrideAccess write) → leave existing attribution
  // as-is; an anonymous client can never reach a post write anyway.
  return data
}

/**
 * Denormalizes the §3 class onto the `attachments` a post references (Task 6D —
 * round-3 fix; round-4 hardening). The raw `/api/attachments[/file]` routes gate
 * on the attachment's own `read`, which keys off `attachments.securityDoc`; that
 * flag must track the owning post(s) or a §3 file leaks via that alternate door.
 *
 * RECOMPUTE-ANY (round-4; round-5 covers ALL reference sites): an attachment's
 * flag is recomputed as "is this attachment referenced by ANY security-doc post,
 * through the array field OR an upload node embedded in content/answer richText?"
 * — NOT blindly set to the writing post's class. Otherwise an ORDINARY post
 * referencing a security-doc attachment id would STRIP the flag (true→false) and
 * re-expose the bytes. Because the value is derived from the full set of
 * referencing security-doc posts (via `postAttachmentRefIds`, which covers all
 * three sites), an unrelated ordinary write can never lower it while a
 * security-doc post still references it; it is cleared ONLY when no security-doc
 * post references it any more (e.g. the privileged board→ordinary flip). The
 * source-guard in `validatePostAgainstBoard` additionally REJECTS an ordinary
 * post referencing a security-doc attachment (any site), so the shared-reference
 * state never even forms; this recompute is the correctness backstop.
 *
 * The security-doc reverse set is computed by scanning security-doc posts (a
 * small set — the §3 libraries) and extracting each one's COMPLETE reference set
 * in JS, because a richText-embedded upload id lives in the Lexical JSON, not the
 * `posts_attachments` join table (so it cannot be matched by a SQL `where`).
 *
 * Runs regardless of `skipPostSideEffects`, so it ALSO fires under the board→posts
 * flag-flip propagation (`propagateSecurityDocToPosts` in Boards.ts) — that is
 * what re-syncs attachment flags on a board flip. DELETE is intentionally NOT
 * handled (fail-closed: an orphaned attachment keeps its restricted flag).
 * `overrideAccess` bypasses the attachment field's write-lock; runs inside the
 * post write's `req`/transaction (so the reverse scan sees this write).
 */
const syncAttachmentSecurityDoc: CollectionAfterChangeHook = async ({ doc, req }) => {
  const mediaIds = postAttachmentRefIds(doc)
  if (mediaIds.length === 0) {
    return doc
  }

  // Authoritative reverse set: every attachment id referenced by ANY security-doc
  // post across ALL three sites (this write included, since it shares the txn).
  // Scanned in JS so richText-embedded ids (not in the join table) are covered.
  const securePosts = await req.payload.find({
    collection: 'posts',
    where: { securityDoc: { equals: true } },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const secureMediaIds = new Set<string>()
  for (const p of securePosts.docs) {
    for (const id of postAttachmentRefIds(p)) {
      secureMediaIds.add(String(id))
    }
  }

  const shouldBeTrue = mediaIds.filter((id: string | number) => secureMediaIds.has(String(id)))
  const shouldBeFalse = mediaIds.filter((id: string | number) => !secureMediaIds.has(String(id)))

  // Raise to true where still false/NULL, and clear to false ONLY where currently
  // true AND no security-doc post references it any more (privileged clear).
  if (shouldBeTrue.length > 0) {
    await req.payload.update({
      collection: 'attachments',
      where: { and: [{ id: { in: shouldBeTrue } }, { securityDoc: { not_equals: true } }] },
      data: { securityDoc: true } as never,
      overrideAccess: true,
      req,
      context: { skipAudit: true },
    })
  }
  if (shouldBeFalse.length > 0) {
    await req.payload.update({
      collection: 'attachments',
      where: { and: [{ id: { in: shouldBeFalse } }, { securityDoc: { equals: true } }] },
      data: { securityDoc: false } as never,
      overrideAccess: true,
      req,
      context: { skipAudit: true },
    })
  }
  return doc
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
    // Visible to content admins (ordinary posts) AND privacy-role admins (§3
    // security-document posts); the `access` below filters WHICH each sees.
    hidden: ({ user }) =>
      !hasMenuAccessSync(user, POSTS_MENU_KEY) && !hasMenuAccessSync(user, SECURITY_DOCS_MENU_KEY),
  },
  // §3 security-document split (Task 6D): ordinary posts gated on `content.posts`;
  // posts under a `securityDoc` board gated on `privacy.securityDocs`. See
  // src/access/securityDocs.ts.
  access: {
    create: securityDocScopedAccess(POSTS_MENU_KEY),
    read: securityDocScopedAccess(POSTS_MENU_KEY),
    update: securityDocScopedAccess(POSTS_MENU_KEY),
    delete: securityDocScopedAccess(POSTS_MENU_KEY),
  },
  // Download statistics (Task 5B; TODO 5.3): GET /api/posts/download-stats[/export].
  // Gated on `statistics.downloads` + an explicit site-assignment check inside
  // the handler (NOT the posts `content.posts` access above). See downloadStatsExport.ts.
  endpoints: downloadStatsEndpoints,
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
    // §3 security-document class, denormalized from the board (Task 6D; ref 3-4).
    // Machine-set from `board.securityDoc` in `validatePostAgainstBoard`; drives
    // the privacy access gate. Write-locked (never client-set) like `boardKind`.
    {
      name: 'securityDoc',
      type: 'checkbox',
      defaultValue: false,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description:
          "Denormalized security-document flag (auto-set from the post's board on save).",
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
        // Repointed media → `attachments` (Task 4-zero): board/post files live
        // in the tenant-scoped, access-controlled `attachments` pool, not the
        // public `media` pool. Field name kept `media` (stable column) — only
        // the target collection changed. Fetch via /api/files/download.
        { name: 'media', type: 'upload', relationTo: 'attachments', required: true },
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
    // D4 (Task 4B): `answer`/`answeredBy`/`answeredAt` are ADMIN-ONLY — gated on
    // `content.posts` so a Q&A questioner (member) can never write them — and
    // `answeredBy`/`answeredAt` are auto-stamped by `stampAnswerAttribution`
    // (unforgeable). See that hook's doc comment.
    {
      name: 'answer',
      type: 'richText',
      access: {
        create: menuFieldAccess(POSTS_MENU_KEY),
        update: menuFieldAccess(POSTS_MENU_KEY),
      },
      admin: {
        condition: (_d, sibling) => sibling?.boardKind === 'qna',
        description: "Admin's answer to a Q&A question. Presence sets isAnswered.",
      },
    },
    {
      name: 'answeredBy',
      type: 'relationship',
      relationTo: 'users',
      access: {
        create: menuFieldAccess(POSTS_MENU_KEY),
        update: menuFieldAccess(POSTS_MENU_KEY),
      },
      admin: {
        readOnly: true,
        condition: (_d, sibling) => sibling?.boardKind === 'qna',
        description: 'Auto-stamped to the admin who wrote the answer.',
      },
    },
    {
      name: 'answeredAt',
      type: 'date',
      access: {
        create: menuFieldAccess(POSTS_MENU_KEY),
        update: menuFieldAccess(POSTS_MENU_KEY),
      },
      admin: {
        readOnly: true,
        condition: (_d, sibling) => sibling?.boardKind === 'qna',
        description: 'Auto-stamped when the answer was written.',
      },
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
    // D4: auto-stamp Q&A answer attribution (runs after field-access has already
    // gated who may write `answer`/`answeredBy`/`answeredAt`).
    beforeChange: [stampAnswerAttribution],
    afterChange: [postsAudit.afterChange, syncAttachmentSecurityDoc],
    afterDelete: [postsAudit.afterDelete],
  },
}
