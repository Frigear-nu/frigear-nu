import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The database-backed tests register users (password hashing) and render the module pages against a served
    // fixture; the first page render compiles it, which can pass vitest's 5s default on a busy CI runner.
    testTimeout: 30_000,
    // `user-store.postgresql.test.ts` boots an embedded (WASM) Postgres in its first `beforeAll` query, which can pass
    // the 10s hook default on a busy CI runner.
    hookTimeout: 60_000,
  },
})
