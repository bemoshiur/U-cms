import type { AfterErrorHook, Payload, PayloadRequest } from 'payload'

import { toRelationId } from '../collections/utils'
import { getUserAgent, resolveActorLabel, resolveIpAddress } from './helpers'
import {
  resolveExceptionClass,
  sanitizeErrorMessage,
  sanitizeStack,
  userAgentFamilyFromUserAgent,
} from './sanitizeError'

/**
 * Global exception capture (Task 5C Part 1; feature-inventory ref 1-56). Writes
 * one `errorLogs` row for a captured unhandled exception. Two guarantees, both
 * required — the SAME contract as `recordAccess`:
 *
 *  1. **try/catch** — capture must NEVER throw into the caller (the error
 *     response / the failing operation must be unaffected by a logging failure).
 *  2. **Transaction isolation** — the write deliberately does NOT pass the
 *     caller's `req` to `payload.create`, so it runs in its OWN transaction on a
 *     separate connection. This matters doubly here: (a) by the time `afterError`
 *     fires the request's own transaction is already aborting, so sharing it
 *     would fail the insert; and (b) the actor may hold a `FOR UPDATE` lock on
 *     their own user row (login/self-edit), which is exactly why the actor is
 *     stored as a TEXT label, never a `users` FK (see `ErrorLogs.ts`).
 */

/** HTTP status at/above which an error is treated as an unhandled exception worth capturing. */
export const ERROR_CAPTURE_MIN_STATUS = 500

export type RecordErrorArgs = {
  /** The thrown error (Error or anything). */
  err: unknown
  /** The originating request, if any (URL/method/actor/IP/UA are derived from it). */
  req?: PayloadRequest
  /** Explicit HTTP status; defaults to the error's own `status`, else 500. */
  statusCode?: number
  /** Explicit URL; defaults to `req.pathname`/`req.url`. */
  url?: string
  /** Explicit HTTP method; defaults to `req.method`. */
  httpMethod?: string
}

/** Reads a numeric `status` off an error-like value, or `undefined`. */
export function statusFromError(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null | undefined)?.status
  return typeof s === 'number' && Number.isFinite(s) ? s : undefined
}

/** The acting admin id as a plain string (never an FK — see ErrorLogs.ts), or undefined. */
function actorIdString(actor: unknown): string | undefined {
  const id = actor ? toRelationId(actor) : undefined
  return id === undefined || id === null ? undefined : String(id)
}

/** The request path, degrading from `pathname` to the pathname of `url`. */
function deriveUrl(req: PayloadRequest | undefined): string | undefined {
  if (req?.pathname) {
    return req.pathname
  }
  if (typeof req?.url === 'string') {
    try {
      return new URL(req.url).pathname
    } catch {
      return req.url
    }
  }
  return undefined
}

/** The request HTTP method, if present on the request. */
function methodOf(req: PayloadRequest | undefined): string | undefined {
  const m = (req as { method?: unknown } | undefined)?.method
  return typeof m === 'string' && m ? m.toUpperCase() : undefined
}

/**
 * Writes one `errorLogs` row for a captured exception. Best-effort — never
 * throws into the caller (see the contract above).
 */
export async function recordError(payload: Payload, args: RecordErrorArgs): Promise<void> {
  try {
    const { err, req } = args
    const error = err instanceof Error ? err : undefined
    const actor = req?.user
    const ua = getUserAgent(req)

    await payload.create({
      collection: 'errorLogs',
      data: {
        occurredAt: new Date().toISOString(),
        exceptionClass: resolveExceptionClass(err),
        message: sanitizeErrorMessage(
          error?.message ?? (typeof err === 'string' ? err : undefined),
        ),
        url: args.url ?? deriveUrl(req) ?? '(unknown)',
        httpMethod: args.httpMethod ?? methodOf(req),
        statusCode: args.statusCode ?? statusFromError(err) ?? ERROR_CAPTURE_MIN_STATUS,
        actorLabel: resolveActorLabel(actor),
        actorId: actorIdString(actor),
        ipAddress: resolveIpAddress(req),
        stackDigest: sanitizeStack(error?.stack),
        userAgentFamily: userAgentFamilyFromUserAgent(ua),
      },
      overrideAccess: true,
      // NB: no `req` — isolated transaction (see the contract above).
    })
  } catch (writeErr) {
    payload?.logger?.error?.(
      { err: writeErr },
      '[audit] recordError failed — swallowed to protect the failing request',
    )
  }
}

/**
 * The config-level `afterError` hook (ref 1-56). Fires for EVERY REST/GraphQL
 * error via Payload's `routeError` (verified in
 * `node_modules/payload/dist/utilities/routeError.js`), extending the T2A
 * per-collection `afterError` pattern (login-failure capture) to a single global
 * capture path that logs to `errorLogs`.
 *
 * ## Only genuine unhandled exceptions (status >= 500)
 *
 * `afterError` fires for expected 4xx too (auth failures, permission denials,
 * validation, not-found), which are NOT "unhandled exceptions" and would flood
 * the log (a failed login is already captured as a `loginHistory` failure row).
 * So capture is filtered to status >= {@link ERROR_CAPTURE_MIN_STATUS}: a real
 * bug throws a plain `Error` with no `status`, which `routeError` surfaces as a
 * 500 — exactly what we want to capture. Returns `undefined` so the original
 * error response is left completely untouched.
 */
export const recordGlobalError: AfterErrorHook = async ({ error, req }) => {
  try {
    const status = statusFromError(error) ?? ERROR_CAPTURE_MIN_STATUS
    if (status < ERROR_CAPTURE_MIN_STATUS) {
      return undefined
    }
    const payload = req?.payload
    if (!payload) {
      return undefined
    }
    await recordError(payload, { err: error, req, statusCode: status })
  } catch (hookErr) {
    req?.payload?.logger?.error?.(
      { err: hookErr },
      '[audit] recordGlobalError failed — swallowed to preserve the error response',
    )
  }
  return undefined
}
