import type { Payload } from 'payload'

import { adminMenusStep } from './steps/adminMenus'
import { rolesStep } from './steps/roles'
import { superAdminStep } from './steps/superAdmin'
import { sitesStep } from './steps/sites'
import { codesStep } from './steps/codes'
import { departmentsStep } from './steps/departments'
import { passwordPoliciesStep } from './steps/passwordPolicies'
import { adminIpRulesStep } from './steps/adminIpRules'
import { boardTypesStep } from './steps/boardTypes'
import { boardsStep } from './steps/boards'
import { postsStep } from './steps/posts'
import { profanityWordsStep } from './steps/profanityWords'
import { memberBannedWordsStep } from './steps/memberBannedWords'
import { displayComponentsStep } from './steps/displayComponents'
import { contentMenusStep } from './steps/contentMenus'
import { publicSiteStep } from './steps/publicSite'
import { termsStep } from './steps/terms'
import { membersStep } from './steps/members'
import { surveysStep } from './steps/surveys'
import { statisticsStep } from './steps/statistics'
import { errorLogsStep } from './steps/errorLogs'
import { personalInfoAccessLogsStep } from './steps/personalInfoAccessLogs'
import { privacyRolesStep } from './steps/privacyRoles'
import type { SeedStep } from './types'

export type { SeedStep } from './types'

/**
 * Ordered registry of seed steps, run sequentially by `runSeed`.
 *
 * Later phases append to this array. Order matters: a step may depend on
 * data an earlier step created:
 *  - `adminMenusStep` runs first — no dependencies, but per the Task 1C
 *    brief it must precede `rolesStep` (future tasks will seed roles whose
 *    `menuGrants` reference these menus).
 *  - `rolesStep` runs next, before `superAdminStep` — it creates
 *    `ROLE_ADMIN`, which `superAdminStep` looks up and assigns (LOCKOUT
 *    SAFETY: the super-admin must never be created/left without it).
 *  - `sitesStep` runs after `superAdminStep`, and `codesStep` runs after
 *    `sitesStep`, per the Task 1B brief.
 *  - `departmentsStep` has no dependency on any of the above but is
 *    registered last to match the brief's Part 3 ordering.
 *  - `passwordPoliciesStep` (Task 1D) has no dependencies; appended last.
 *  - `adminIpRulesStep` (Task 2C) needs the admin site (`sitesStep`) and the
 *    `system.ipAccessControl` menu (`adminMenusStep`); appended last.
 *  - `boardTypesStep` (Task 3A) has no dependencies; must precede `boardsStep`
 *    (boards reference board types by their PG code).
 *  - `boardsStep` (Task 3A) needs the demo site (`sitesStep`) and the built-in
 *    board types (`boardTypesStep`); appended last.
 *  - `profanityWordsStep` / `memberBannedWordsStep` (Task 3B) have no
 *    dependencies. `profanityWordsStep` must precede `postsStep` (seeded posts
 *    must not contain a seeded profanity word — the placeholders are chosen so
 *    they don't).
 *  - `postsStep` (Task 3B) needs the demo site + the seeded boards (Notice /
 *    Gallery / Q&A); appended last.
 *  - `displayComponentsStep` (Task 3C) needs the admin ('bos') + demo sites
 *    (`sitesStep`) and the `content.*` display menus (`adminMenusStep`);
 *    appended last.
 *  - `contentMenusStep` (Task 3D) needs the demo site (`sitesStep`) and the
 *    seeded Notice board (`boardsStep`); appended last.
 *  - `publicSiteStep` (Task 4A) needs the demo site + its content menus
 *    (`contentMenusStep`); adds the demo logo/footer, a top+child section, and
 *    guide-menu extras for the public frontend. Appended last.
 *  - `membersStep` (Task 4B) needs the demo site (`sitesStep`); seeds example
 *    public-site members (one active, one pending). Appended last.
 *  - `surveysStep` (Task 4D) needs the demo site (`sitesStep`); seeds one open
 *    example survey with questions + responses. Appended last.
 */
export const seedSteps: SeedStep[] = [
  adminMenusStep,
  rolesStep,
  superAdminStep,
  sitesStep,
  codesStep,
  departmentsStep,
  passwordPoliciesStep,
  adminIpRulesStep,
  boardTypesStep,
  boardsStep,
  profanityWordsStep,
  memberBannedWordsStep,
  postsStep,
  displayComponentsStep,
  contentMenusStep,
  publicSiteStep,
  // Task 4E: versioned terms MUST seed BEFORE members (so seeded members'
  // consent snapshots reference the real active terms version).
  termsStep,
  membersStep,
  surveysStep,
  // Task 4E: satisfaction ratings + page views (feed Phase-5 statistics).
  statisticsStep,
  // Task 5C: a few example error logs so the error-stats tabs + drill-down render.
  errorLogsStep,
  // Task 6A: example personal-info access logs (needs members/site — runs last).
  personalInfoAccessLogsStep,
  // Task 6C: privacy-org roles + example assignments (needs adminMenus, the
  // super-admin, and departments — so it runs after all of them).
  privacyRolesStep,
]

/**
 * Runs the given seed steps (defaults to the full `seedSteps` registry)
 * sequentially against a booted `Payload` instance, logging before/after
 * each step. Every step is expected to be idempotent.
 */
export async function runSeed(payload: Payload, steps: SeedStep[] = seedSteps): Promise<void> {
  for (const step of steps) {
    payload.logger.info(`[seed] running step "${step.name}"...`)
    await step.run(payload)
    payload.logger.info(`[seed] finished step "${step.name}".`)
  }
}
