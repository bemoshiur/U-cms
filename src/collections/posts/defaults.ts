import type { BoardTypeKind } from '../boards/defaults'

/**
 * Shared constants for the `posts` collection (Task 3B). Kept beside the
 * collection so the collection, the seed, the download endpoint, and the
 * integration tests all assert against one source of truth (mirrors
 * `src/collections/boards/defaults.ts`).
 */

/** The admin menuKey gating `posts` (append to the adminMenus seed). */
export const POSTS_MENU_KEY = 'content.posts'

/** Number of positional category slots on a post (ref 1-29 — up to 3). */
export const POST_CATEGORY_SLOTS = 3

/** Number of extra varchar / extra text slots (ref 1-30 field grid). */
export const POST_EXTRA_FIELD_COUNT = 4

/**
 * board-kind → post behavior map (ref 1-33, 2-5, 2-6). Every kind is served by
 * the SINGLE `posts` collection — behavior is keyed off the post's board's
 * `boardType.kind`, never a separate collection. Denormalized onto each post
 * as `boardKind` (set in `beforeValidate`) so the admin UI can conditionally
 * show kind-specific fields (qna answer, photo representative) without an async
 * lookup, and so list views can filter by kind.
 *
 *  - integrated → standard post (title/body/attachments/categories).
 *  - photo      → gallery card driven by the ONE representative attachment.
 *  - qna        → a question that an admin answers (answer/answeredBy/answeredAt);
 *                 `isAnswered` is derived from answer presence.
 *  - faq        → standard post; rendered accordion-style in Phase 4, ordered by
 *                 the board's sortOrder. No extra schema.
 *  - attachment → file-host post; each attachment exposes a managed download URL
 *                 (src/endpoints/fileDownload.ts). The legacy fixed board is
 *                 bbsId B0000009.
 *  - extended   → standard post using the board's extra fields.
 */
export const POST_KIND_BEHAVIOR: Record<BoardTypeKind, string> = {
  integrated: 'standard',
  photo: 'gallery-representative',
  qna: 'question-answer',
  faq: 'accordion',
  attachment: 'file-host',
  extended: 'extra-fields',
}

/**
 * Field-grid `fieldKey`s whose `requiredFlag` this collection enforces
 * SERVER-SIDE at write time (ref 1-30). The rest of the grid's keys are either
 * system-managed (`number`, `viewCount`, `registrationDate`,
 * `modificationDate`) or not part of the post schema (`division`), so their
 * `requiredFlag` is a Phase-4 form/render concern, not a persistence
 * invariant. `attachment` is handled specially (requires ≥1 attachment). See
 * the config-driven-validation split in task-3B-report.md.
 */
export const REQUIRED_ENFORCED_FIELD_KEYS = [
  'title',
  'author',
  'department',
  'extraField1',
  'extraField2',
  'extraField3',
  'extraField4',
  'extraContent1',
  'extraContent2',
  'extraContent3',
  'extraContent4',
] as const
