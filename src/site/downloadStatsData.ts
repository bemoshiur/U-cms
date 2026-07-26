import type { Payload, PayloadRequest } from 'payload'

import { toRelationId } from '../collections/utils'
import {
  type DownloadRow,
  topDownloads,
  sortDownloads,
  totalDownloads,
} from '../content/downloadStats'

/**
 * Shared read-side for the download statistics (Task 5B; TODO 5.3, ref 2-18).
 * Flattens a site's posts' `attachments[]` (each carrying the cumulative
 * `downloadCount`) into {@link DownloadRow}s joined to the owning board + post
 * for labels, and assembles the TOP-N + detail payload the admin view renders
 * and the CSV export serializes — one source of truth so the two never diverge.
 *
 * ## Tenant scoping (why an EXPLICIT tenant filter, not the caller's access)
 *
 * Unlike the traffic stats (which read the `trafficDaily` collection gated on
 * the SAME `statistics.traffic` key as the view), download counts live inside
 * `posts` — a collection gated on `content.posts`, a DIFFERENT key from
 * `statistics.downloads`. A downloads-stats admin need not hold `content.posts`,
 * so reading posts under the caller's own access would wrongly yield zero rows.
 * Instead the endpoint/view (1) gates on `statistics.downloads`, (2) asserts the
 * caller is assigned to the requested site (or is super), and only THEN calls
 * this loader, which reads posts with `overrideAccess: true` FILTERED to that
 * one `tenant`. The `where: { tenant }` is the load-bearing tenant boundary.
 */

/** Reads a site's per-file download rows (cumulative counts + labels). */
export async function loadDownloadRows(
  payload: Payload,
  args: { tenantId: string | number; req?: PayloadRequest },
): Promise<DownloadRow[]> {
  const { tenantId, req } = args
  const found = await payload.find({
    collection: 'posts',
    // Exclude §3 security-document posts (Task 6D L1): download stats are gated
    // on `statistics.downloads`, NOT the privacy grant, so a stats admin must
    // never see security-doc file metadata. `not_equals: true` keeps ordinary
    // posts (securityDoc NULL/false) in the counts.
    where: { and: [{ tenant: { equals: tenantId } }, { securityDoc: { not_equals: true } }] },
    // depth 1 populates the post's `board` (name) and each attachment's `media`
    // upload (filename) so labels resolve without an N+1 per-file lookup.
    depth: 1,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const rows: DownloadRow[] = []
  for (const post of found.docs as unknown as Record<string, unknown>[]) {
    const attachments = Array.isArray(post.attachments) ? post.attachments : []
    const board = post.board as { id?: unknown; name?: unknown } | null | undefined
    const boardId = toRelationId(post.board) ?? null
    const boardName =
      board && typeof board === 'object' && typeof board.name === 'string' ? board.name : null
    const postTitle = typeof post.title === 'string' ? post.title : String(post.id ?? '')
    for (const a of attachments as Record<string, unknown>[]) {
      const media = a.media as { filename?: unknown } | null | undefined
      const filename =
        media && typeof media === 'object' && typeof media.filename === 'string'
          ? media.filename
          : null
      rows.push({
        postId: post.id as string | number,
        postTitle,
        boardId,
        boardName,
        fileSn: typeof a.fileSn === 'number' ? a.fileSn : 0,
        filename,
        description: typeof a.description === 'string' ? a.description : null,
        downloadCount: typeof a.downloadCount === 'number' ? a.downloadCount : 0,
      })
    }
  }
  return rows
}

export type DownloadStatsPayload = {
  /** Sum of every file's download count on the site. */
  totalDownloads: number
  /** Distinct files that carry at least one attachment row. */
  fileCount: number
  /** TOP-N most-downloaded files (default 20) — the chart. */
  top: DownloadRow[]
  /** Every file, deterministically ordered — the detail table + full CSV. */
  detail: DownloadRow[]
}

/** Assembles the download-stats payload from a set of rows (pure composition). */
export function buildDownloadStatsPayload(
  rows: DownloadRow[],
  args: { topLimit?: number } = {},
): DownloadStatsPayload {
  return {
    totalDownloads: totalDownloads(rows),
    fileCount: rows.length,
    top: topDownloads(rows, args.topLimit ?? 20),
    detail: sortDownloads(rows),
  }
}
