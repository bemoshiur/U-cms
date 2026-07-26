import { describe, expect, it } from 'vitest'

import {
  type DownloadRow,
  downloadRowLabel,
  sortDownloads,
  topDownloads,
  topN,
  totalDownloads,
} from '@/content/downloadStats'

/** Task 5B (TODO 5.3, ref 2-18) — pure download-statistics helpers. */

function row(partial: Partial<DownloadRow> & { downloadCount: number }): DownloadRow {
  return {
    postId: partial.postId ?? 1,
    postTitle: partial.postTitle ?? 'Post',
    boardId: partial.boardId ?? 1,
    boardName: partial.boardName ?? 'Board',
    fileSn: partial.fileSn ?? 1,
    filename: partial.filename ?? 'file.pdf',
    description: partial.description ?? null,
    downloadCount: partial.downloadCount,
  }
}

describe('downloadStats pure helpers', () => {
  it('totalDownloads sums counts (ignoring non-finite)', () => {
    expect(totalDownloads([row({ downloadCount: 3 }), row({ downloadCount: 5 })])).toBe(8)
    expect(totalDownloads([])).toBe(0)
    expect(totalDownloads([row({ downloadCount: Number.NaN })])).toBe(0)
  })

  it('sortDownloads orders by count desc then board, title, fileSn (deterministic)', () => {
    const rows = [
      row({ postTitle: 'B', downloadCount: 2, boardName: 'Z', fileSn: 1 }),
      row({ postTitle: 'A', downloadCount: 10, boardName: 'Notice', fileSn: 1 }),
      row({ postTitle: 'A', downloadCount: 2, boardName: 'Notice', fileSn: 2 }),
      row({ postTitle: 'A', downloadCount: 2, boardName: 'Notice', fileSn: 1 }),
    ]
    const sorted = sortDownloads(rows)
    expect(sorted.map((r) => r.downloadCount)).toEqual([10, 2, 2, 2])
    // Among the count=2 ties: board "Notice" before "Z"; within Notice/A, fileSn 1 before 2.
    expect(sorted.slice(1).map((r) => `${r.boardName}/${r.postTitle}/${r.fileSn}`)).toEqual([
      'Notice/A/1',
      'Notice/A/2',
      'Z/B/1',
    ])
  })

  it('topDownloads returns the N highest by count', () => {
    const rows = [1, 9, 4, 7, 2].map((n, i) => row({ postTitle: `p${i}`, downloadCount: n }))
    expect(topDownloads(rows, 2).map((r) => r.downloadCount)).toEqual([9, 7])
    expect(topDownloads(rows, 100)).toHaveLength(5)
    expect(topDownloads(rows, 0)).toHaveLength(0)
  })

  it('topN is a generic top-N by selector', () => {
    const items = [{ v: 1 }, { v: 5 }, { v: 3 }]
    expect(topN(items, (x) => x.v, 2).map((x) => x.v)).toEqual([5, 3])
  })

  it('downloadRowLabel composes board / post (filename)', () => {
    expect(
      downloadRowLabel(
        row({ boardName: 'Notice', postTitle: 'Hi', filename: 'a.pdf', downloadCount: 0 }),
      ),
    ).toBe('Notice / Hi (a.pdf)')
    const bare: DownloadRow = {
      postId: 1,
      postTitle: 'Hi',
      boardId: null,
      boardName: null,
      fileSn: 1,
      filename: null,
      description: null,
      downloadCount: 0,
    }
    expect(downloadRowLabel(bare)).toBe('Hi')
  })
})
