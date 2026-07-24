import type { Payload } from 'payload'

/**
 * One named, idempotent unit of seed work. Steps run sequentially (array
 * order in `src/seed/index.ts`) against a booted `Payload` instance, so a
 * later step can rely on data an earlier step created.
 */
export type SeedStep = {
  /** Short, stable, kebab-case identifier used in log output. */
  name: string
  /** Performs the seed work. Must be safe to call more than once. */
  run: (payload: Payload) => Promise<void>
}
