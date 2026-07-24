import type { Payload, PayloadRequest } from 'payload'

import { geoLookup } from './geo'
import { getUserAgent, resolveIpAddress } from './helpers'
import { isMobileUserAgent } from './userAgent'

export type RecordLoginHistoryArgs = {
  /** Optional explicit failure reason (failed-login path). */
  failReason?: string
  /** The attempted/real login identifier (legacy 아이디). */
  loginId?: string
  req: PayloadRequest
  /** Whether the login succeeded. */
  success: boolean
  /** Optional explicit UA; defaults to the request's `user-agent` header. */
  userAgent?: string
  /** The user's display name (legacy 이름). */
  userLabel?: string
}

/**
 * Writes one `loginHistory` row (Task 2A Part 3; refs 3-5/3-6/3-7). One
 * collection backs all three legacy screens — the overseas / mobile / failure
 * "views" are just filtered queries on `isOverseas` / `isMobile` / `success`
 * (see `LoginHistory.ts`).
 *
 * Same never-break-the-caller contract as `recordAccess`: transaction-isolated
 * (no `req` passed to `payload.create`) and fully wrapped in try/catch. The
 * geo (`geoLookup`) and mobile (`isMobileUserAgent`) classifiers are the
 * pluggable seams; both currently default conservatively (domestic / desktop).
 */
export async function recordLoginHistory(
  payload: Payload,
  args: RecordLoginHistoryArgs,
): Promise<void> {
  try {
    const userAgent = args.userAgent ?? getUserAgent(args.req)
    const ipAddress = resolveIpAddress(args.req)

    await payload.create({
      collection: 'loginHistory',
      data: {
        userLabel: args.userLabel,
        loginId: args.loginId,
        success: args.success,
        failReason: args.failReason,
        ipAddress,
        isOverseas: geoLookup(ipAddress),
        isMobile: isMobileUserAgent(userAgent),
        userAgent,
      },
      overrideAccess: true,
    })
  } catch (err) {
    payload?.logger?.error?.(
      { err },
      '[audit] recordLoginHistory failed — swallowed to protect the login flow',
    )
  }
}
