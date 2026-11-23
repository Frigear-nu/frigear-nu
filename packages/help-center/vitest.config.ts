import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The server module a Nuxt build generates (`#help-center/optional`): unit tests import it as a file and mock it.
    // `@nuxthub/db`: an in-memory SQLite with the module's tables, for unit tests of the database helpers.
    alias: {
      '#help-center/optional': fileURLToPath(new URL('./test/unit/stubs/optional.ts', import.meta.url)),
      '@nuxthub/db': fileURLToPath(new URL('./test/unit/stubs/nuxthub-db.ts', import.meta.url)),
    },
  },
  test: {
    // The database-backed suite runs the fixture in dev mode: page renders compile on their first request and users
    // register with password hashing, so a test making many first-time calls can pass vitest's 5s default on a busy
    // CI runner (turbo runs four packages at once there).
    testTimeout: 30_000,
  },
})
