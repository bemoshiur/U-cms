import { describe, expect, it } from 'vitest'

import { extractLexicalAttachmentIds, postAttachmentRefIds } from '@/content/attachmentRefs'

/** A lexical editor-state whose children are the given nodes. */
function lexical(children: unknown[]) {
  return { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children } }
}
function uploadNode(value: unknown, relationTo = 'attachments') {
  return { type: 'upload', version: 3, relationTo, value, fields: null, format: '' }
}
function paragraph(text: string) {
  return {
    type: 'paragraph',
    version: 1,
    children: [{ type: 'text', text, version: 1 }],
  }
}

describe('attachmentRefs — the complete post→attachment reference set (Task 6D round-5)', () => {
  describe('extractLexicalAttachmentIds', () => {
    it('returns [] for null/malformed input', () => {
      expect(extractLexicalAttachmentIds(null)).toEqual([])
      expect(extractLexicalAttachmentIds(undefined)).toEqual([])
      expect(extractLexicalAttachmentIds(42)).toEqual([])
      expect(extractLexicalAttachmentIds({})).toEqual([])
    })

    it('collects an attachments upload node id (raw id and populated {id})', () => {
      expect(extractLexicalAttachmentIds(lexical([uploadNode(7), paragraph('x')]))).toEqual([7])
      expect(extractLexicalAttachmentIds(lexical([uploadNode({ id: 9 })]))).toEqual([9])
    })

    it('ignores upload/relationship nodes pointing at OTHER collections', () => {
      expect(extractLexicalAttachmentIds(lexical([uploadNode(7, 'media')]))).toEqual([])
      expect(
        extractLexicalAttachmentIds(lexical([{ ...uploadNode(7, 'users'), type: 'relationship' }])),
      ).toEqual([])
    })

    it('also collects a relationship node → attachments', () => {
      expect(
        extractLexicalAttachmentIds(lexical([{ ...uploadNode(5), type: 'relationship' }])),
      ).toEqual([5])
    })

    it('recurses into nested children (e.g. a block/quote wrapper)', () => {
      const nested = lexical([
        { type: 'block', version: 1, children: [uploadNode(11), paragraph('deep')] },
      ])
      expect(extractLexicalAttachmentIds(nested)).toEqual([11])
    })
  })

  describe('postAttachmentRefIds — union of array + content + answer, de-duplicated', () => {
    it('unions all three reference sites', () => {
      const ids = postAttachmentRefIds({
        attachments: [{ media: 1 }, { media: { id: 2 } }],
        content: lexical([uploadNode(3), paragraph('body')]),
        answer: lexical([uploadNode(4)]),
      })
      expect(new Set(ids)).toEqual(new Set([1, 2, 3, 4]))
    })

    it('de-duplicates an id referenced through more than one site', () => {
      const ids = postAttachmentRefIds({
        attachments: [{ media: 5 }],
        content: lexical([uploadNode(5)]),
        answer: lexical([uploadNode(5)]),
      })
      expect(ids).toHaveLength(1)
      expect(String(ids[0])).toBe('5')
    })

    it('handles a post with no attachments/richText', () => {
      expect(postAttachmentRefIds({})).toEqual([])
      expect(postAttachmentRefIds({ attachments: [], content: null, answer: undefined })).toEqual(
        [],
      )
    })
  })
})
