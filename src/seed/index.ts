import type { Payload } from 'payload'

import { superAdminStep } from './steps/superAdmin'
import type { SeedStep } from './types'

export type { SeedStep } from './types'

/**
 * Ordered registry of seed steps, run sequentially by `runSeed`.
 *
 * Later phases append to this array (e.g. site records, menu tree, code
 * sets — see TODO.md Phase 7.6). Order matters: a step may depend on data
 * an earlier step created.
 */
export const seedSteps: SeedStep[] = [superAdminStep]

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
