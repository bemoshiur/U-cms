import { expect, test } from '@playwright/test'

/**
 * Task 7E: the `/health` readiness probe (src/app/(frontend)/health/route.ts).
 * A pure HTTP GET (no browser page, no auth) — it must be reachable without
 * being blocked by the admin IP guard and must report DB connectivity.
 */
test.describe('Health readiness probe', () => {
  test('GET /health returns 200 with { ok, db, version } when the DB is reachable', async ({
    request,
  }) => {
    const res = await request.get('/health')
    expect(res.status()).toBe(200)

    const body = (await res.json()) as { ok: boolean; db: boolean; version: string }
    expect(body.ok).toBe(true)
    expect(body.db).toBe(true)
    expect(typeof body.version).toBe('string')
    expect(body.version.length).toBeGreaterThan(0)

    // Leaks nothing beyond the documented shape.
    expect(Object.keys(body).sort()).toEqual(['db', 'ok', 'version'])
  })
})
