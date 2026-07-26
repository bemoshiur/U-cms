import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { recordError, recordGlobalError } from '@/audit/recordError'
import { recordAccess } from '@/audit/recordAccess'
import { handleErrorStats, handleErrorStatsExport } from '@/endpoints/errorStatsExport'
import { handleAccessHistory, handleAccessHistoryExport } from '@/endpoints/accessHistoryExport'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'

/**
 * Task 5C — error-log module + site access-history view (refs 1-56..1-59, 2-20).
 * Boots real Payload against Postgres.
 */

let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 100000)}`
}
function uniqueEmail(label: string): string {
  return `${unique(label)}@example.com`.toLowerCase()
}
function uniqueRoleId(label: string): string {
  return `ROLE_ERR_${unique(label).toUpperCase()}`
}

function fakeReq(args: {
  headers?: Record<string, string>
  pathname?: string
  url?: string
  method?: string
  user?: unknown
}): PayloadRequest {
  return {
    payload,
    headers: new Headers(args.headers ?? {}),
    pathname: args.pathname,
    url: args.url,
    method: args.method,
    user: args.user,
    context: {},
  } as unknown as PayloadRequest
}

async function menuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id as number
}

async function makeSuper(): Promise<Record<string, unknown>> {
  const role = await payload.create({
    collection: 'roles',
    data: { roleId: uniqueRoleId('SUP'), name: 'err super', description: 'x', isSuper: true },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: uniqueEmail('errsup'),
      password: TEST_PASSWORD,
      roles: [role.id],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function makeGranted(menuKey: string): Promise<Record<string, unknown>> {
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: uniqueRoleId('GRANT'),
      name: 'grant',
      description: 'x',
      menuGrants: [await menuId(menuKey)],
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: uniqueEmail('errgrant'),
      password: TEST_PASSWORD,
      roles: [role.id],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function makeRoleless(): Promise<Record<string, unknown>> {
  return payload.create({
    collection: 'users',
    data: {
      email: uniqueEmail('errnone'),
      password: TEST_PASSWORD,
      roles: [],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

describe('Task 5C — error-log module + access-history view', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [adminMenusStep])
  })

  // ── Part 1 — global capture (recordError / recordGlobalError) ──────────────
  describe('recordError — sanitizes, captures identity, never throws', () => {
    it('captures class/url/method/actorLabel/ip and SANITIZES the message', async () => {
      const actor = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('actor'),
          password: TEST_PASSWORD,
          name: 'Err Actor',
          loginId: unique('erractor').toLowerCase(),
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      const url = `/api/test/${unique('u')}`
      const err = new TypeError('boom for password=hunter2 and token=abc123secret')

      await recordError(payload, {
        err,
        req: fakeReq({
          headers: {
            'x-forwarded-for': '203.0.113.9, 10.0.0.1',
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
          },
          pathname: url,
          method: 'POST',
          user: actor as unknown,
        }),
      })

      const found = await payload.find({
        collection: 'errorLogs',
        where: { url: { equals: url } },
        overrideAccess: true,
      })
      expect(found.docs).toHaveLength(1)
      const row = found.docs[0]!
      expect(row.exceptionClass).toBe('TypeError')
      expect(row.httpMethod).toBe('POST')
      expect(row.statusCode).toBe(500)
      expect(row.ipAddress).toBe('203.0.113.9')
      expect(row.actorLabel).toBe(`Err Actor(${(actor as { loginId: string }).loginId})`)
      expect(row.userAgentFamily).toBe('windows/chrome')
      // Message scrubbed — no secrets persisted.
      expect(row.message).not.toContain('hunter2')
      expect(row.message).not.toContain('abc123secret')
      expect(row.message).toContain('[REDACTED]')
    })

    it('never throws into the caller even if the write is impossible', async () => {
      const brokenPayload = {
        create: async () => {
          throw new Error('db down')
        },
        logger: { error: () => {} },
      } as unknown as Payload
      await expect(
        recordError(brokenPayload, { err: new Error('x'), req: fakeReq({}) }),
      ).resolves.toBeUndefined()
    })
  })

  describe('recordGlobalError (afterError hook) — captures 500+, skips 4xx', () => {
    it('captures an unhandled 500 (no status) but NOT an expected 4xx', async () => {
      const url500 = `/api/boom/${unique('u')}`
      const url403 = `/api/forbidden/${unique('u')}`

      // Plain Error → routeError surfaces 500 → captured.
      await recordGlobalError({
        error: new Error('kaboom'),
        req: fakeReq({ pathname: url500, method: 'GET' }),
        context: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      // A 403 error → NOT captured (expected client error, not an exception).
      const forbidden = Object.assign(new Error('Forbidden'), { status: 403 })
      await recordGlobalError({
        error: forbidden,
        req: fakeReq({ pathname: url403, method: 'GET' }),
        context: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const cap = await payload.find({
        collection: 'errorLogs',
        where: { url: { equals: url500 } },
        overrideAccess: true,
      })
      expect(cap.docs).toHaveLength(1)

      const skipped = await payload.find({
        collection: 'errorLogs',
        where: { url: { equals: url403 } },
        overrideAccess: true,
      })
      expect(skipped.docs).toHaveLength(0)
    })

    it('H1 — a GraphQL 4xx (originalError.status) is NOT captured; a GraphQL 500 IS', async () => {
      const urlGq403 = `/api/graphql/${unique('gq403')}`
      const urlGq500 = `/api/graphql/${unique('gq500')}`
      // graphql-js locatedError wraps a resolver throw in a GraphQLError whose OWN
      // .status is undefined — the real status is on .originalError.
      const gql403 = Object.assign(new Error('GraphQL error'), {
        name: 'GraphQLError',
        originalError: Object.assign(new Error('Forbidden'), { status: 403 }),
      })
      const gql500 = Object.assign(new Error('GraphQL error'), {
        name: 'GraphQLError',
        originalError: new Error('resolver bug'), // statusless server throw → 500
      })

      await recordGlobalError({
        error: gql403,
        req: fakeReq({ pathname: urlGq403, method: 'POST' }),
        context: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      await recordGlobalError({
        error: gql500,
        req: fakeReq({ pathname: urlGq500, method: 'POST' }),
        context: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      expect(
        (
          await payload.find({
            collection: 'errorLogs',
            where: { url: { equals: urlGq403 } },
            overrideAccess: true,
          })
        ).docs,
      ).toHaveLength(0)
      const captured = await payload.find({
        collection: 'errorLogs',
        where: { url: { equals: urlGq500 } },
        overrideAccess: true,
      })
      expect(captured.docs).toHaveLength(1)
      expect(captured.docs[0]!.statusCode).toBe(500)
    })
  })

  // ── Part 1 — immutability + gating (mirror the audit backbone) ─────────────
  describe('errorLogs are append-only + immutable + gated', () => {
    it('rejects update even for a super, even under overrideAccess', async () => {
      await recordError(payload, {
        err: new Error('immutable test'),
        req: fakeReq({ pathname: '/x' }),
      })
      const any = await payload.find({ collection: 'errorLogs', limit: 1, overrideAccess: true })
      const id = any.docs[0]!.id
      const superUser = await makeSuper()

      await expect(
        payload.update({
          collection: 'errorLogs',
          id,
          data: { url: '/tampered' },
          user: superUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
      await expect(
        payload.update({
          collection: 'errorLogs',
          id,
          data: { url: '/tampered' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('denies a roleless user read + delete; allows a system.errorLogs grantee', async () => {
      const roleless = await makeRoleless()
      await expect(
        payload.find({ collection: 'errorLogs', user: roleless, overrideAccess: false }),
      ).rejects.toThrow()

      const any = await payload.find({ collection: 'errorLogs', limit: 1, overrideAccess: true })
      await expect(
        payload.delete({
          collection: 'errorLogs',
          id: any.docs[0]!.id,
          user: roleless,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      const granted = await makeGranted('system.errorLogs')
      await expect(
        payload.find({ collection: 'errorLogs', user: granted, overrideAccess: false }),
      ).resolves.toBeDefined()
    })

    it('create denies everyone through the access layer (system-writer-only)', async () => {
      const granted = await makeGranted('system.errorLogs')
      await expect(
        payload.create({
          collection: 'errorLogs',
          data: { occurredAt: new Date().toISOString(), exceptionClass: 'X' } as never,
          user: granted,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  // ── Part 1 — stat tabs + drill-down + export (gated) ───────────────────────
  describe('error statistics: tabs + drill-down + gated + export', () => {
    it('aggregates by type/url/period, drills down, and gates + exports', async () => {
      const marker = `Zzz${unique('T')}Error`.replace(/[^A-Za-z0-9]/g, '')
      const urlA = `/api/stat-a/${unique('u')}`
      const urlB = `/api/stat-b/${unique('u')}`
      const today = new Date().toISOString().slice(0, 10)

      // 2 on urlA, 1 on urlB — all this marker class, all today.
      for (const u of [urlA, urlA, urlB]) {
        await payload.create({
          collection: 'errorLogs',
          data: {
            occurredAt: new Date().toISOString(),
            exceptionClass: marker,
            message: 'agg test',
            url: u,
            statusCode: 500,
          } as never,
          overrideAccess: true,
        })
      }

      const granted = await makeGranted('system.errorLogs')
      const reqG = { user: granted, payload } as unknown as PayloadRequest

      const jsonResp = await handleErrorStats({
        payload,
        req: reqG,
        searchParams: new URLSearchParams(`from=${today}&to=${today}`),
      })
      expect(jsonResp.status).toBe(200)
      const body = (await jsonResp.json()) as {
        stats: { type: { key: string; count: number }[]; url: { key: string; count: number }[] }
      }
      expect(body.stats.type.find((t) => t.key === marker)?.count).toBe(3)
      expect(body.stats.url.find((u) => u.key === urlA)?.count).toBe(2)
      expect(body.stats.url.find((u) => u.key === urlB)?.count).toBe(1)

      // CSV export of the type tab carries the marker.
      const csvResp = await handleErrorStatsExport({
        payload,
        req: reqG,
        searchParams: new URLSearchParams(`from=${today}&to=${today}&tab=type`),
      })
      expect(csvResp.status).toBe(200)
      expect(await csvResp.text()).toContain(marker)

      // Roleless → 403 for both JSON + CSV.
      const roleless = await makeRoleless()
      const reqN = { user: roleless, payload } as unknown as PayloadRequest
      expect(
        (
          await handleErrorStats({
            payload,
            req: reqN,
            searchParams: new URLSearchParams(`from=${today}&to=${today}`),
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await handleErrorStatsExport({
            payload,
            req: reqN,
            searchParams: new URLSearchParams(`from=${today}&to=${today}&tab=url`),
          })
        ).status,
      ).toBe(403)
    })
  })

  // ── Part 2 — site access-history view (over existing accessLogs) ───────────
  describe('access-history view: masked + gated + paginated + export', () => {
    it('queries accessLogs by keyword, masks actor/IP, paginates, gates, and exports', async () => {
      const token = unique('hist').toLowerCase()
      const actor = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('histactor'),
          password: TEST_PASSWORD,
          name: 'Hist Actor',
          loginId: unique('histid').toLowerCase(),
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      // Two access rows sharing a unique URL token, so keyword search isolates them.
      for (let i = 0; i < 2; i++) {
        await recordAccess(payload, {
          req: fakeReq({
            headers: { 'x-forwarded-for': '203.0.113.77' },
            pathname: `/admin/${token}/${i}`,
            user: actor as unknown,
          }),
          action: 'view',
          menuKey: 'system.sites',
          menuLabel: 'Site Information Management',
          url: `/admin/${token}/${i}`,
        })
      }

      const granted = await makeGranted('privacy.accessLogs')
      const reqG = { user: granted, payload } as unknown as PayloadRequest

      // Page 1 of 2, limit 1 — masked rows, correct totals.
      const p1 = await handleAccessHistory({
        payload,
        req: reqG,
        searchParams: new URLSearchParams(`keyword=${token}&limit=1&page=1`),
      })
      expect(p1.status).toBe(200)
      const b1 = (await p1.json()) as {
        history: {
          total: number
          totalPages: number
          rows: { actorLabelMasked: string; ipAddressMasked: string; url: string }[]
        }
      }
      expect(b1.history.total).toBe(2)
      expect(b1.history.totalPages).toBe(2)
      expect(b1.history.rows).toHaveLength(1)
      // Masked, never raw.
      expect(b1.history.rows[0]!.actorLabelMasked).toContain('*')
      expect(b1.history.rows[0]!.actorLabelMasked).not.toContain('Hist Actor')
      expect(b1.history.rows[0]!.ipAddressMasked).toBe('203.0.113.*')

      const p2 = await handleAccessHistory({
        payload,
        req: reqG,
        searchParams: new URLSearchParams(`keyword=${token}&limit=1&page=2`),
      })
      const b2 = (await p2.json()) as { history: { rows: { url: string }[] } }
      expect(b2.history.rows[0]!.url).not.toBe(b1.history.rows[0]!.url)

      // CSV export is masked + carries the rows.
      const csv = await handleAccessHistoryExport({
        payload,
        req: reqG,
        searchParams: new URLSearchParams(`keyword=${token}`),
      })
      expect(csv.status).toBe(200)
      const csvText = await csv.text()
      expect(csvText).toContain('203.0.113.*')
      expect(csvText).not.toContain('203.0.113.77')
      expect(csvText).not.toContain('Hist Actor')

      // Roleless → 403 for JSON + CSV.
      const roleless = await makeRoleless()
      const reqN = { user: roleless, payload } as unknown as PayloadRequest
      expect(
        (
          await handleAccessHistory({
            payload,
            req: reqN,
            searchParams: new URLSearchParams(`keyword=${token}`),
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await handleAccessHistoryExport({
            payload,
            req: reqN,
            searchParams: new URLSearchParams(`keyword=${token}`),
          })
        ).status,
      ).toBe(403)
    })
  })
})
