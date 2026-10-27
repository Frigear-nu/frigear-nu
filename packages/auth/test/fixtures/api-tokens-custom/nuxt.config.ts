import { fileURLToPath } from 'node:url'

// The `auth-db` fixture (its test routes, user store and migrations) with a host token prefix. The schema is the same,
// so the layer's migrations apply; `nuxt db generate` here only diffs against this folder, so do not commit its output.
export default defineNuxtConfig({
  extends: ['../auth-db'],
  authentication: {
    userStore: fileURLToPath(new URL('../auth-db/server/utils/user-store', import.meta.url)),
    apiTokens: { prefix: 'acme_' },
  },
})
