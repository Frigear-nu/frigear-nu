import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Pure helpers, the client mode's core and Capacitor adapters, plus the in-process fake issuer.
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts'],
          environment: 'node',
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
