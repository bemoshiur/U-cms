import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Security-doc architecture guard (Task 7A — security-doc decision).
 *
 * The §3 security-document model (Task 6D) is a `securityDoc` FLAG denormalized
 * across the shared `posts`/`attachments` collections, kept correct by
 * `postAttachmentRefIds` (src/content/attachmentRefs.ts). That walk covers only
 * `upload` + `relationship` Lexical nodes (target in `value`) and recurses
 * `children`. A `block` node (BlocksFeature) hides refs in `fields`, and a
 * `table` cell (TableFeature) hides them in cells — NEITHER is walked, so a
 * security-doc attachment embedded through such a feature would escape the flag
 * sync and the ordinary-post cross-reference rejection (a §3 leak).
 *
 * The DECISION for Task 7A is to KEEP the sealed flag approach (verified-closed;
 * a dedicated-collection rearchitecture is deferred — see task-7A-report.md) and
 * add THIS guard so the fragility cannot silently regress: the shared editor
 * (`src/richTextEditor.ts`) must NOT gain a feature that can carry an attachment
 * reference outside an `upload`/`relationship` node without the walk being
 * extended in lock-step. If someone enables one of these features this test
 * FAILS, forcing them to extend `extractLexicalAttachmentIds` first.
 */

const EDITOR_SOURCE = readFileSync(path.resolve(__dirname, '../../src/richTextEditor.ts'), 'utf8')

/**
 * Feature identifiers that introduce a Lexical node type able to carry an
 * `attachments` reference OUTSIDE the walked `upload`/`relationship` nodes.
 * Matched against CODE only (comments in the file legitimately name them).
 */
const ATTACHMENT_CARRYING_FEATURES = ['BlocksFeature', 'TableFeature', 'EXPERIMENTAL_TableFeature']

/** Strips line + block comments so we scan executable code, not the doc block. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('richTextEditor security-doc walk guard (Task 7A)', () => {
  const code = stripComments(EDITOR_SOURCE)

  it('does not enable a feature that can carry an attachment ref the walk misses', () => {
    for (const feature of ATTACHMENT_CARRYING_FEATURES) {
      expect(
        code.includes(feature),
        `richTextEditor.ts enables ${feature}, which can embed an attachment reference OUTSIDE ` +
          `the upload/relationship nodes that postAttachmentRefIds walks. This reopens the §3 ` +
          `security-doc leak class (Task 6D). Extend extractLexicalAttachmentIds ` +
          `(src/content/attachmentRefs.ts) to walk the new node type, then update this guard.`,
      ).toBe(false)
    }
  })

  it('still restricts richText uploads to the gated attachments pool', () => {
    // The confidentiality model rests on uploads being embeddable ONLY from the
    // tenant-scoped, gated `attachments` collection (Task 4-zero). If this
    // regresses, the walk-scope guard above is moot.
    expect(code).toContain("RICHTEXT_UPLOAD_COLLECTIONS = ['attachments']")
    expect(code).toContain('enabledCollections')
  })
})
