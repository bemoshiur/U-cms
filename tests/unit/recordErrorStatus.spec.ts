import { describe, expect, it } from 'vitest'

import { statusFromError } from '@/audit/recordError'

/**
 * Task 5C — H1 regression. `statusFromError` must resolve the status through the
 * GraphQL wrapper (`GraphQLError.originalError.status`) and native `.cause`
 * chains, so the "capture 500s, skip 4xx" filter is not bypassed for the GraphQL
 * surface (`/api/graphql`), where the top-level `.status` is always undefined.
 */

/** A GraphQLError-shaped wrapper, optionally wrapping a server `originalError`. */
function graphqlError(originalError?: unknown): Error {
  return Object.assign(new Error('GraphQL error'), {
    name: 'GraphQLError',
    ...(originalError !== undefined ? { originalError } : {}),
  })
}

describe('statusFromError', () => {
  it('reads a direct numeric status', () => {
    expect(statusFromError(Object.assign(new Error('x'), { status: 403 }))).toBe(403)
    expect(statusFromError(Object.assign(new Error('x'), { status: 500 }))).toBe(500)
  })

  it('unwraps a GraphQLError to its originalError.status (the H1 fix)', () => {
    expect(
      statusFromError(graphqlError(Object.assign(new Error('Forbidden'), { status: 403 }))),
    ).toBe(403)
    expect(statusFromError(graphqlError(Object.assign(new Error('Bad'), { status: 400 })))).toBe(
      400,
    )
    expect(statusFromError(graphqlError(Object.assign(new Error('boom'), { status: 500 })))).toBe(
      500,
    )
  })

  it('unwraps a native .cause chain', () => {
    const wrapped = Object.assign(new Error('outer'), {
      cause: Object.assign(new Error('inner'), { status: 404 }),
    })
    expect(statusFromError(wrapped)).toBe(404)
  })

  it('returns undefined when no status exists anywhere (statusless throw → caller defaults to 500)', () => {
    expect(statusFromError(new Error('plain'))).toBeUndefined()
    expect(statusFromError(graphqlError(new Error('resolver bug')))).toBeUndefined()
    expect(statusFromError(graphqlError())).toBeUndefined()
    expect(statusFromError('string error')).toBeUndefined()
  })

  it('does not loop on a self-referential cause', () => {
    const e = new Error('loop') as Error & { cause?: unknown }
    e.cause = e
    expect(statusFromError(e)).toBeUndefined()
  })
})
