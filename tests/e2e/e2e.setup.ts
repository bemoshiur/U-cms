import { test as setup } from '@playwright/test'

import { provisionE2e } from './helpers/apiSetup'

/**
 * The `setup` project (Task 7C). Runs once, before the chromium suites, against
 * the live webServer: provisions the dedicated e2e admins, turns the back-office
 * 2FA on, drives a real OTP enrolment for e2e-super, and writes the captured
 * fixtures to helpers/.fixtures.json. See helpers/apiSetup.ts.
 */
setup('provision authenticated e2e state', async ({ request }) => {
  setup.setTimeout(120_000)
  const fixtures = await provisionE2e(request)
  console.log('[e2e setup] provisioned:', JSON.stringify(fixtures))
})
