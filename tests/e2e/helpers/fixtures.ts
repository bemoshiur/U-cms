import { readFileSync } from 'fs'
import path from 'path'

/**
 * Where the setup project writes the captured ids + the e2e super's TOTP secret.
 * Resolved from `process.cwd()` (the repo root under `pnpm test:e2e`) rather
 * than `import.meta.url` — the tsx/esm loader Playwright runs under mishandles
 * `import.meta` in these helper modules.
 */
export const FIXTURES_PATH = path.join(process.cwd(), 'tests/e2e/helpers/.fixtures.json')

export type E2eFixtures = {
  demoSiteId: number
  bosSiteId: number
  /** A §3 security-document board (gated on privacy.securityDocs). */
  securityDocBoardId: number
  securityDocBoardName: string
  /** The seeded Q&A board (ordinary content board). */
  qnaBoardId: number
  qnaBoardBbsId: string
  /** The seeded Notice board. */
  noticeBoardId: number
  noticeBoardBbsId: string
  /** The seeded active demo member's id (member@demo.example.com). */
  demoMemberId: number
  /** The TOTP secret the setup enrolled `e2e-super` with (real enrolment flow). */
  superTotpSecret: string
}

/**
 * Reads the fixtures the setup project captured. MUST be called inside a test /
 * beforeAll (never at module top-level) — the file is written by the `setup`
 * project, which runs before the chromium project but AFTER test collection.
 */
export function readFixtures(): E2eFixtures {
  try {
    return JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as E2eFixtures
  } catch (err) {
    throw new Error(
      `[e2e] fixtures missing at ${FIXTURES_PATH} — the setup project must run first. ${String(err)}`,
    )
  }
}
