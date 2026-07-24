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
