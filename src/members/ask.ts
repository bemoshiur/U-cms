import type { Payload } from 'payload'
import { APIError } from 'payload'

import { toRelationId } from '../collections/utils'
import type { CurrentMember } from '../site/member'

/**
 * Public-site member Q&A "ask" (Task 4C Part 3; refs 2-8 Q&A, 1-33). A logged-in
 * MEMBER submits a question on a Q&A board that has `userPostAllowed` on. This is
 * the security-critical counterpart to {@link submitMemberSignup}: it builds the
 * `posts` record SERVER-SIDE from an allow-list of member-settable fields only
 * (`title`, `content`), and NEVER reads client-supplied privileged fields:
 *
 *  - `board`/`tenant`/`author` are FORCE-SET from server state (the resolved
 *    board + the member's session), so a member cannot plant a question on
 *    another board or another site, or spoof a different author.
 *  - `isNotice`/`isSecret`/`answer`/`answeredBy`/`answeredAt` are NEVER passed —
 *    a member cannot pin a notice, publish a secret post, or forge an answer /
 *    its attribution (the D4 field-level gates on `posts` would strip them
 *    anyway on a non-override write; here we simply never build them).
 *
 * The create runs with `overrideAccess: true` (a system write with no `req.user`,
 * exactly like signup) — so the posts collection's tenant MEMBERSHIP guard (which
 * only fires for a non-super `req.user`) is skipped, and we enforce the
 * member↔board same-tenant boundary HERE instead. The posts `beforeValidate`
 * hook still runs (overrideAccess bypasses ACCESS, not hooks), so the PROFANITY
 * filter and required-field checks apply to the member's submission.
 */

/** Thrown for a client-correctable ask problem; carries an HTTP status. */
export class MemberAskError extends APIError {}

export type MemberAskInput = {
  title?: unknown
  content?: unknown
  // NOTE: board/tenant/author/isNotice/isSecret/answer may appear in a hostile
  // payload — intentionally absent from the allow-list below and never read.
  [key: string]: unknown
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Wraps plain member text into the minimal Lexical editor state `posts.content` stores. */
function plainTextToLexical(text: string) {
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
          children:
            text.length > 0
              ? [
                  {
                    type: 'text',
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text,
                    version: 1,
                  },
                ]
              : [],
        },
      ],
    },
  }
}

/**
 * Creates a member Q&A question on `bbsId`. Validates the member session, that
 * the board exists on the MEMBER'S OWN site, is a `qna` board with
 * `userPostAllowed`, and that a title is present. Returns the new post id.
 * Throws {@link MemberAskError} for any client-correctable problem.
 */
export async function submitMemberQuestion(
  payload: Payload,
  input: MemberAskInput,
  context: { member: CurrentMember; bbsId: string },
): Promise<{ id: number | string }> {
  const { member, bbsId } = context

  if (!member) {
    throw new MemberAskError('You must be signed in to ask a question.', 401)
  }
  const memberTenantId = toRelationId(member.tenant)
  if (memberTenantId === undefined) {
    throw new MemberAskError('Your account is not associated with a site.', 403)
  }

  // Resolve the board on the MEMBER's own site (tenant), depth 1 for its kind.
  const boards = await payload.find({
    collection: 'boards',
    where: { and: [{ tenant: { equals: memberTenantId } }, { bbsId: { equals: bbsId } }] },
    depth: 1,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const board = boards.docs[0]
  if (!board) {
    // Same 404-style posture: don't confirm a board exists on another site.
    throw new MemberAskError('This board is not available.', 404)
  }
  const kind = (board.boardType as { kind?: string } | null | undefined)?.kind
  if (kind !== 'qna') {
    throw new MemberAskError('Questions can only be posted on a Q&A board.', 400)
  }
  if (board.userPostAllowed !== true) {
    throw new MemberAskError('This board does not accept member questions.', 403)
  }

  const title = asTrimmedString(input.title)
  if (title.length === 0) {
    throw new MemberAskError('A question title is required.', 400)
  }
  const body = asTrimmedString(input.content)

  // Build the post from ALLOWED fields only. board/author are server-forced;
  // tenant is derived by the posts hook from the board; isNotice/isSecret/answer
  // are never set (member cannot forge them).
  try {
    const created = await payload.create({
      collection: 'posts',
      data: {
        board: board.id,
        title,
        author: member.name ?? undefined,
        content: plainTextToLexical(body),
      } as never,
      overrideAccess: true,
    })
    return { id: created.id }
  } catch (err) {
    // The posts beforeValidate hook throws APIError for profanity / required
    // fields — surface its message; anything else is a generic failure.
    if (err instanceof APIError) {
      throw new MemberAskError(err.message, 400)
    }
    throw new MemberAskError('Your question could not be posted. Please try again.', 400)
  }
}
