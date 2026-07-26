import type { Payload } from 'payload'

import type { SeedStep } from '../types'
import { sanitizeErrorMessage } from '../../audit/sanitizeError'

/**
 * Seeds a few example error logs (Task 5C; refs 1-56..1-59) so the error-log
 * list, the statistics tabs (period/type/URL) and the drill-down render with
 * real data out of the box. Spread across the last few days with varied
 * exception classes / URLs / statuses so the tabs are non-trivial.
 *
 * Idempotent: seeds only when there are NO error logs yet, so a re-run (and,
 * crucially, real captured errors) is never duplicated. The messages are passed
 * through the SAME `sanitizeErrorMessage` scrubber the live capture uses — one
 * sample deliberately embeds a fake token so the seeded data demonstrates the
 * redaction (and never persists a look-alike secret).
 */
export const errorLogsStep: SeedStep = {
  name: 'error-logs',
  async run(payload: Payload) {
    const existing = await payload.find({
      collection: 'errorLogs',
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      payload.logger.info('[seed:error-logs] error logs already present — skipping.')
      return
    }

    type Sample = {
      exceptionClass: string
      message: string
      url: string
      httpMethod: string
      statusCode: number
      userAgentFamily: string
      dayOffset: number
    }
    const samples: Sample[] = [
      {
        exceptionClass: 'TypeError',
        message: "Cannot read properties of undefined (reading 'id')",
        url: '/api/posts',
        httpMethod: 'GET',
        statusCode: 500,
        userAgentFamily: 'windows/chrome',
        dayOffset: 1,
      },
      {
        exceptionClass: 'TypeError',
        message: 'foo is not a function',
        url: '/api/posts',
        httpMethod: 'POST',
        statusCode: 500,
        userAgentFamily: 'macos/safari',
        dayOffset: 1,
      },
      {
        exceptionClass: 'DatabaseError',
        // Deliberately embeds a fake token to prove the sanitizer scrubs it.
        message: 'connection failed token=abc123secretvalue while querying',
        url: '/api/menus',
        httpMethod: 'GET',
        statusCode: 500,
        userAgentFamily: 'android/chrome',
        dayOffset: 2,
      },
      {
        exceptionClass: 'APIError',
        message: 'Something went wrong.',
        url: '/api/globals/settings',
        httpMethod: 'PATCH',
        statusCode: 500,
        userAgentFamily: 'windows/edge',
        dayOffset: 3,
      },
    ]

    for (const s of samples) {
      const occurredAt = new Date(Date.now() - s.dayOffset * 86_400_000).toISOString()
      await payload.create({
        collection: 'errorLogs',
        data: {
          occurredAt,
          exceptionClass: s.exceptionClass,
          message: sanitizeErrorMessage(s.message),
          url: s.url,
          httpMethod: s.httpMethod,
          statusCode: s.statusCode,
          actorLabel: null,
          actorId: null,
          ipAddress: null,
          stackDigest: `${s.exceptionClass}: ${sanitizeErrorMessage(s.message)}\n    at handler (/app/src/${s.url.replace(/[^a-z]/gi, '')}.ts:1:1)`,
          userAgentFamily: s.userAgentFamily,
        } as never,
        overrideAccess: true,
      })
    }
    payload.logger.info(`[seed:error-logs] created ${samples.length} example error logs.`)
  },
}
