import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic: layout, platform filter, the registry and `extendDashboard`, the Home tab; and the layout
        // composable with Nuxt's virtual modules mocked.
        resolve: {
          // One stub per module: `vi.mock` replaces modules by resolved file.
          alias: Object.fromEntries(['#imports', '#dashboard/optional', '#dashboard/registry', '#widgets/registry']
            .map(name => [name, fileURLToPath(new URL(`./test/unit/stubs/${name.slice(1).replace('/', '-')}.ts`, import.meta.url))])),
        },
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
