import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  PayloadRequest,
} from 'payload'
import { APIError } from 'payload'

import {
  STANDARD_ENACTED_NOTICE,
  STANDARDIZATION_BYPASS_LOCK,
} from '../../standardization/constants'

/**
 * Enacted-standard write lock (refs 1-61/1-63/1-65 business rule): an `enacted`
 * (baseline) dictionary row cannot be directly UPDATED or DELETED — the manual
 * requires changes to flow through the DBA-reviewed edit/discard PROPOSAL
 * workflow (built in Task 8.1b). Institution-registered (`enacted: false`)
 * entries remain freely editable/deletable by a DBA.
 *
 * These hooks are the enforcement half of that rule (the collection's
 * `admin.description` surfaces the human notice). They fire regardless of
 * `overrideAccess` (Payload hooks always run), so a trusted caller — the seed,
 * and later 8.1b's proposal-approval action — signals its intent to bypass the
 * lock via `req.context[STANDARDIZATION_BYPASS_LOCK] = true`. That is the
 * forward-compatible seam 8.1b builds its "apply approved proposal" mutation on;
 * 8.1a itself never needs it because it only CREATES enacted rows (creates are
 * not locked) and edits only institution rows.
 */

function bypassRequested(req: PayloadRequest | undefined): boolean {
  const ctx = req?.context as Record<string, unknown> | undefined
  return ctx?.[STANDARDIZATION_BYPASS_LOCK] === true
}

/** Rejects a direct UPDATE of an already-enacted row. */
export const lockEnactedBeforeChange: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation === 'update' && originalDoc?.enacted === true && !bypassRequested(req)) {
    throw new APIError(STANDARD_ENACTED_NOTICE, 403)
  }
  return data
}

/** Rejects a direct DELETE of an enacted row. */
export const lockEnactedBeforeDelete: CollectionBeforeDeleteHook = async ({
  id,
  req,
  collection,
}) => {
  if (bypassRequested(req)) {
    return
  }
  const doc = await req.payload.findByID({
    collection: collection.slug,
    id,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if ((doc as { enacted?: unknown } | null)?.enacted === true) {
    throw new APIError(STANDARD_ENACTED_NOTICE, 403)
  }
}
