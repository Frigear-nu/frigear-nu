import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // The registry the module generates, as the unit tests of the server helpers see it.
      '#maps/server-registry': fileURLToPath(new URL('./test/server-registry.ts', import.meta.url)),
    },
  },
})
