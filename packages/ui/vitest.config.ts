import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        // Nuxt defines `import.meta.dev`; the unit tests run the runtime code as in development.
        define: { 'import.meta.dev': 'true' },
        test: {
          name: 'unit',
          include: ['test/unit/*.{test,spec}.ts'],
          environment: 'node',
          passWithNoTests: true,
        },
      },
      {
        // Builds and serves the `test/fixtures/*` apps through @nuxt/test-utils.
        test: {
          name: 'e2e',
          include: ['test/*.{test,spec}.ts'],
          environment: 'node',
          testTimeout: 120_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
})
