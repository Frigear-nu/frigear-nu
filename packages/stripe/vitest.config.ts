import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The e2e suites share a fixture served in dev mode: its first page render compiles the app, which can pass
    // vitest's 5s default on a busy CI runner.
    testTimeout: 30_000,
  },
})
