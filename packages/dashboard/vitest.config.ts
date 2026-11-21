import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic: layout, platform filter, the registry and `extendDashboard`, the Home tab.
        test: {
          name: 'unit',
          include: ['test/unit/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
      {
        // Builds and serves `test/fixtures/basic` through @nuxt/test-utils.
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
