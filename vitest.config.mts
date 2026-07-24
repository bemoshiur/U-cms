import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

/**
 * Two suites, mirroring Payload's own website-template convention:
 *  - unit: tests/unit/**\/*.spec.ts — pure node, no external services.
 *  - int:  tests/int/**\/*.int.spec.ts — boots real Payload against Postgres.
 *
 * Run everything with `pnpm test`, or a single suite with `pnpm test:unit`
 * / `pnpm test:int` (`vitest run --project <name>`).
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    /**
     * Every `int` spec boots its own `Payload` instance against the same
     * shared dev Postgres DB, and each boot runs Payload's dev
     * schema-push. Two int spec files booting concurrently (the default —
     * Vitest runs separate test files in parallel workers) race the same
     * DDL (e.g. both issuing `CREATE TYPE ... AS ENUM`), and Postgres
     * rejects the loser with "type already exists" / "relation already
     * exists". Serializing file execution avoids that race. Surfaced when
     * `tests/int/sites.int.spec.ts` became the second int spec file
     * (Task 1A) — with only one int file this was never observable.
     */
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'int',
          environment: 'node',
          include: ['tests/int/**/*.int.spec.ts'],
        },
      },
    ],
  },
})
