import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The database-backed tests register users (password hashing) against a served fixture, which can pass vitest's
    // 5s default on a busy CI runner.
    testTimeout: 30_000,
  },
})
