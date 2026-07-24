import type { Payload } from 'payload'

import { superAdminStep } from './steps/superAdmin'
import { sitesStep } from './steps/sites'
import { codesStep } from './steps/codes'
import { departmentsStep } from './steps/departments'
import type { SeedStep } from './types'

export type { SeedStep } from './types'

/**
 * Ordered registry of seed steps, run sequentially by `runSeed`.
 *
 * Later phases append to this array (e.g. menu tree — see TODO.md Phase
 * 7.6). Order matters: a step may depend on data an earlier step created —
 * `sitesStep` runs after `superAdminStep`, and `codesStep` runs after
 * `sitesStep` per the Task 1B brief. `departmentsStep` has no dependency on
 * either but is registered last to match the brief's Part 3 ordering.
 */
export const seedSteps: SeedStep[] = [superAdminStep, sitesStep, codesStep, departmentsStep]

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
