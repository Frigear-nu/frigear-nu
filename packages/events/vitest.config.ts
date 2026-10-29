import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The database-backed suite runs the fixture in dev mode: page renders compile on their first request and users
    // register with password hashing, so a test making many first-time calls can pass vitest's 5s default on a busy
    // CI runner (turbo runs four packages at once there).
    testTimeout: 30_000,
  },
})
