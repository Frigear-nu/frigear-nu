import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The e2e suites build and serve the `test/fixtures/*` apps; loading one with `loadNuxt` takes seconds too.
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
})
