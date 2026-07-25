import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { extractLexicalText } from '../content/wordFilter'
import { diffContent } from '../content/webContentDiff'
import type { WebContentSnapshot } from '../content/webContentDiff'

/**
 * Web-content version DIFF endpoint (Task 3D Part 2; ref 2-4). Collection
 * endpoint mounted at:
 *
 *   GET /api/webContents/:id/diff?from={versionId}&to={versionId}
 *
 * Returns the structured field/line diff between two versions of ONE web
 * content. ACCESS-GATED + TENANT-SCOPED: the caller must be able to READ the
 * parent web content under normal access control (`content.webContents` grant +
 * assigned to the content's site), which the existence-then-access two-step
 * below enforces exactly like `fileDownload.canDownloadPost`. Both requested
 * versions must belong to this same document (a version ID from another doc is
 * rejected), so the diff can never leak another site's content.
 *
 * The pure diff lives in `src/content/webContentDiff.ts`; here we only resolve
 * access, load the two versions, flatten each version's Lexical `content` to
 * text, and hand the snapshots to `diffContent`. The split/unified RENDER UI is
 * Phase 4.
 */

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status })
}

type VersionRow = {
  parent?: unknown
  version?: Record<string, unknown>
}

/** Flattens a loaded version's fields to the plain-text snapshot the diff compares. */
function toSnapshot(row: VersionRow): WebContentSnapshot {
  const v = row.version ?? {}
  return {
    name: typeof v.name === 'string' ? v.name : '',
    title: typeof v.title === 'string' ? v.title : '',
    content: extractLexicalText(v.content),
  }
}

/**
 * Testable core — resolves access, loads both versions, and returns the diff
 * (or an error Response). Pure of any HTTP framework so integration tests call
 * it directly with a Local-API `payload` + a `user` fixture (mirrors
 * `handleFileDownload`).
 */
export async function handleWebContentDiff(args: {
  payload: Payload
  user: unknown
  id: string | number | null | undefined
  from: string | null | undefined
  to: string | null | undefined
  req?: PayloadRequest
}): Promise<Response> {
  const { payload, user, req } = args
  const id = args.id

  if (id === null || id === undefined || id === '') {
    return json(400, { ok: false, message: 'A web content id is required.' })
  }
  if (!args.from || !args.to) {
    return json(400, { ok: false, message: 'Both "from" and "to" version ids are required.' })
  }

  // Existence first (overrideAccess) so a genuine 404 is distinct from a 403.
  const exists = await payload.findByID({
    collection: 'webContents',
    id,
    depth: 0,
    overrideAccess: true,
    req,
    disableErrors: true,
  })
  if (!exists) {
    return json(404, { ok: false, message: 'Web content not found.' })
  }

  // Access gate — respects the collection's tenant-scoped `content.webContents`
  // access. A missing grant throws Forbidden; a wrong-tenant doc filters out to
  // null. Either way → 403.
  let allowed = false
  try {
    const readable = await payload.findByID({
      collection: 'webContents',
      id,
      depth: 0,
      overrideAccess: false,
      user: user as PayloadRequest['user'],
      req,
      disableErrors: true,
    })
    allowed = Boolean(readable)
  } catch {
    allowed = false
  }
  if (!allowed) {
    return json(403, { ok: false, message: 'You are not allowed to view this content’s versions.' })
  }

  // Load both versions (access already confirmed on the parent). Guard that
  // each belongs to THIS document so a version ID from another doc is rejected.
  const loadVersion = async (versionId: string): Promise<VersionRow | null> =>
    (await payload.findVersionByID({
      collection: 'webContents',
      id: versionId,
      depth: 0,
      overrideAccess: true,
      req,
      disableErrors: true,
    })) as unknown as VersionRow | null

  const [fromVersion, toVersion] = await Promise.all([loadVersion(args.from), loadVersion(args.to)])
  if (!fromVersion || !toVersion) {
    return json(404, { ok: false, message: 'One or both versions were not found.' })
  }
  const belongsToDoc = (row: VersionRow): boolean =>
    row.parent !== undefined && String(row.parent) === String(id)
  if (!belongsToDoc(fromVersion) || !belongsToDoc(toVersion)) {
    return json(400, { ok: false, message: 'A version does not belong to this web content.' })
  }

  const diff = diffContent(toSnapshot(fromVersion), toSnapshot(toVersion))
  return json(200, { ok: true, id, from: args.from, to: args.to, diff })
}

export const webContentDiffEndpoint: Endpoint = {
  path: '/:id/diff',
  method: 'get',
  handler: async (req) =>
    handleWebContentDiff({
      payload: req.payload,
      user: req.user,
      req,
      id: req.routeParams?.id as string | undefined,
      from: req.searchParams?.get('from'),
      to: req.searchParams?.get('to'),
    }),
}
