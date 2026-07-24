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
     * `next start` always runs with NODE_ENV=production, which now requires
     * `SMTP_HOST` (see the production fail-fast in src/payload.config.ts).
     * Point it at the local Mailpit relay (docker-compose's `mailpit`
     * service) by default so `pnpm test:e2e` keeps working out of the box,
     * both locally and in CI, without requiring extra env setup. An
     * explicit SMTP_HOST already in the environment still wins.
     */
    env: {
      SMTP_HOST: process.env.SMTP_HOST || 'localhost',
      SMTP_PORT: process.env.SMTP_PORT || '1025',
    },
  },
})
