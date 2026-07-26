/**
 * Pure download-statistics domain (Task 5B; TODO 5.3, ref 2-18). Turns the flat
 * per-file download rows (one per `posts.attachments[]` entry, carrying the
 * cumulative `downloadCount`) into the TOP-N chart + detail table the admin
 * download-statistics view renders and the CSV export serializes. Kept free of
 * any Payload/Node runtime so every rule is unit-testable and shared by the
 * stats endpoints and the admin view.
 *
 * ## Why cumulative, not a time-series
 *
 * The legacy 첨부파일 다운로드 통계 (ref 2-18) is primarily a cumulative
 * per-file counter (`downloadCount` on the attachment), not a per-day event
 * log. So the core is a TOP-N of the current cumulative counts + a detail table;
 * there is deliberately no daily rollup collection (a `downloadEvents` time
 * dimension would be an additive later concern — documented in the report).
 */

/** One counted file: the attachment's cumulative download count + its labels. */
export type DownloadRow = {
  postId: string | number
  postTitle: string
  boardId: string | number | null
  boardName: string | null
  /** Per-post file sequence number (stable download URL key). */
  fileSn: number
  filename: string | null
  description: string | null
  downloadCount: number
}

/** Sum of `downloadCount` across all rows. */
export function totalDownloads(rows: readonly DownloadRow[]): number {
  return rows.reduce((sum, r) => sum + (Number.isFinite(r.downloadCount) ? r.downloadCount : 0), 0)
}

/**
 * Sorts download rows by count DESC, then board name, post title, and fileSn
 * ASC — a fully deterministic order so the TOP-N, the detail table, and the CSV
 * are stable across runs (ties never shuffle).
 */
export function sortDownloads(rows: readonly DownloadRow[]): DownloadRow[] {
  return [...rows].sort((a, b) => {
    if (b.downloadCount !== a.downloadCount) {
      return b.downloadCount - a.downloadCount
    }
    const bn = (a.boardName ?? '').localeCompare(b.boardName ?? '')
    if (bn !== 0) {
      return bn
    }
    const tn = a.postTitle.localeCompare(b.postTitle)
    if (tn !== 0) {
      return tn
    }
    return a.fileSn - b.fileSn
  })
}

/** Generic top-N by a numeric selector (desc). Stable for equal keys via input order. */
export function topN<T>(rows: readonly T[], selector: (row: T) => number, limit: number): T[] {
  return [...rows].sort((a, b) => selector(b) - selector(a)).slice(0, Math.max(0, limit))
}

/** The TOP-N most-downloaded files (default 20), fully deterministically ordered. */
export function topDownloads(rows: readonly DownloadRow[], limit = 20): DownloadRow[] {
  return sortDownloads(rows).slice(0, Math.max(0, limit))
}

/** A human label for a download row: "Board / Post title (filename)". */
export function downloadRowLabel(row: DownloadRow): string {
  const file = row.filename ? ` (${row.filename})` : ''
  const board = row.boardName ? `${row.boardName} / ` : ''
  return `${board}${row.postTitle}${file}`
}
