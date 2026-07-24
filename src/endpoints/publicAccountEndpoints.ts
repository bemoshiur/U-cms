import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { submitAccountRequest } from '../accounts/accountRequest'
import { findId, findPassword } from '../accounts/recovery'

/**
 * Public (unauthenticated) REST endpoints for the admin-account lifecycle
 * (Task 1D brief Parts 3 & 4). Registered at the config level
 * (`payload.config.ts` → `endpoints`), so they are served under
 * `/api/<path>`: `/api/account-request`, `/api/find-id`, `/api/find-password`.
 *
 * These are thin: parse the JSON body, delegate to the pure business
 * functions in `src/accounts/*` (which are unit/int-tested directly against
 * the Local API), and shape the HTTP response. Each catches `APIError` to
 * return its status/message, and returns a generic 500 otherwise.
 *
 * NOTE: the custom login VIEW (ref 1-1's conditional "Account Request" /
 * "Find ID·PW" buttons) is deferred to the Phase 2 2FA login rework per the
 * brief — only these endpoints exist now.
 */

async function readJson(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json?.()) ?? {}
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof APIError) {
    return Response.json({ ok: false, message: error.message }, { status: error.status })
  }
  return Response.json({ ok: false, message: 'An unexpected error occurred.' }, { status: 500 })
}

export const accountRequestEndpoint: Endpoint = {
  path: '/account-request',
  method: 'post',
  handler: async (req) => {
    try {
      const body = await readJson(req)
      const result = await submitAccountRequest(req.payload, body, req)
      return Response.json(
        {
          ok: true,
          id: result.id,
          message: 'Your account application has been submitted and is awaiting approval.',
        },
        { status: 201 },
      )
    } catch (error) {
      return errorResponse(error)
    }
  },
}

export const findIdEndpoint: Endpoint = {
  path: '/find-id',
  method: 'post',
  handler: async (req) => {
    try {
      const body = await readJson(req)
      const result = await findId(req.payload, body, req)
      return Response.json({ ok: true, message: result.message }, { status: 200 })
    } catch (error) {
      return errorResponse(error)
    }
  },
}

export const findPasswordEndpoint: Endpoint = {
  path: '/find-password',
  method: 'post',
  handler: async (req) => {
    try {
      const body = await readJson(req)
      const result = await findPassword(req.payload, body, req)
      return Response.json({ ok: true, message: result.message }, { status: 200 })
    } catch (error) {
      return errorResponse(error)
    }
  },
}

export const publicAccountEndpoints: Endpoint[] = [
  accountRequestEndpoint,
  findIdEndpoint,
  findPasswordEndpoint,
]
