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

/**
 * Reads a numeric HTTP `status` off an error-like value, unwrapping the common
 * error-wrapping chains before giving up. This is load-bearing for the GraphQL
 * surface (`/api/graphql`): graphql-js `locatedError` wraps a resolver throw in a
 * `GraphQLError` whose OWN `.status` is `undefined` — the real status sits at
 * `error.originalError.status` (confirmed in node_modules/graphql + Payload's
 * GraphQL handler). Without this unwrap every GraphQL error (incl. 4xx
 * validation/permission) looks statusless → defaults to 500 → gets captured as a
 * bogus "unhandled exception". So we walk `.originalError` (GraphQLError) and
 * `.cause` (native Error chaining), returning the first numeric status found.
 */
export function statusFromError(err: unknown): number | undefined {
  let cur: unknown = err
  const seen = new Set<unknown>()
  for (let depth = 0; depth < 6 && cur && typeof cur === 'object' && !seen.has(cur); depth++) {
    seen.add(cur)
    const s = (cur as { status?: unknown }).status
    if (typeof s === 'number' && Number.isFinite(s)) {
      return s
    }
    cur = (cur as { originalError?: unknown }).originalError ?? (cur as { cause?: unknown }).cause
  }
  return undefined
}

/**
 * True for a CLIENT-side GraphQL error — a `GraphQLError` with no wrapped server
 * `originalError` (a query syntax/validation error, an unknown-field error, …).
 * These are 4xx-class client mistakes, not unhandled server exceptions, and must
 * NOT be captured. A GraphQLError that DOES wrap an `originalError` (a genuine
 * resolver throw) is not a client error and is captured as normal.
 */
function isGraphqlClientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  if ((err as { name?: unknown }).name !== 'GraphQLError') {
    return false
  }
  const original = (err as { originalError?: unknown }).originalError
  return original === undefined || original === null
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
 *
 * ## GraphQL (`/api/graphql`) — status lives on `originalError`
 *
 * `statusFromError` unwraps the `GraphQLError` wrapper so a resolver's 4xx
 * (permission/validation) is correctly seen as 4xx and skipped — NOT defaulted to
 * 500 (H1). A pure GraphQL client error (a query syntax/validation error with NO
 * wrapped server error) has no status anywhere in the chain; it is a client
 * mistake, not an unhandled exception, so it is skipped via
 * {@link isGraphqlClientError} rather than defaulted to 500. A GraphQLError that
 * wraps a genuine statusless server throw still defaults to 500 and IS captured.
 */
export const recordGlobalError: AfterErrorHook = async ({ error, req }) => {
  try {
    const payload = req?.payload
    if (!payload) {
      return undefined
    }
    const resolved = statusFromError(error)
    if (resolved !== undefined) {
      // An explicit status anywhere in the chain (incl. GraphQL originalError.status).
      if (resolved < ERROR_CAPTURE_MIN_STATUS) {
        return undefined
      }
    } else if (isGraphqlClientError(error)) {
      // No status + a bare GraphQLError → a client-side GraphQL error. Skip.
      return undefined
    }
    await recordError(payload, {
      err: error,
      req,
      statusCode: resolved ?? ERROR_CAPTURE_MIN_STATUS,
    })
  } catch (hookErr) {
    req?.payload?.logger?.error?.(
      { err: hookErr },
      '[audit] recordGlobalError failed — swallowed to preserve the error response',
    )
  }
  return undefined
}
