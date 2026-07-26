import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * `webServer` runs the *production* build (`pnpm start`, i.e. `next start`)
 * rather than `next dev`, so e2e catches build-time regressions too.
 * `pnpm build` is NOT run automatically here (rebuilding on every test run
 * is too slow) — run `pnpm build` yourself before `pnpm test:e2e`, or let
 * CI's `e2e` job do it (see .github/workflows/ci.yml).
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Only pick up e2e specs — vitest owns tests/unit and tests/int. */
  testMatch: '**/*.e2e.spec.ts',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    /*
     * `next start` always runs with NODE_ENV=production. Since Task TR2 Part 3,
     * production WITHOUT `SMTP_HOST` no longer throws — it disables email (no-op
     * logging transport). We still point e2e at the local Mailpit relay
     * (docker-compose's `mailpit` service) by default so any email-dependent
     * flow actually delivers to a real inbox during the run, keeping
     * `pnpm test:e2e` deterministic out of the box. An explicit SMTP_HOST in the
     * environment still wins.
     */
    env: {
      SMTP_HOST: process.env.SMTP_HOST || 'localhost',
      SMTP_PORT: process.env.SMTP_PORT || '1025',
      /*
       * Task 2C: disable the admin IP guard for e2e. `next start` runs in
       * production, so with an ARMED allowlist (e.g. after `pnpm seed`) and no
       * `TRUSTED_PROXY_HOPS` configured, the guard would deliberately fail
       * closed (503) — see src/security/adminIpEnforcement.ts. The e2e smoke
       * test targets the admin UI, not IP enforcement (which is covered by the
       * unit + int suites), so bypass it here for a deterministic run. An
       * explicit value in the environment still wins.
       */
      ADMIN_IP_ENFORCEMENT: process.env.ADMIN_IP_ENFORCEMENT || 'off',
    },
  },
})
