import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// `vue` is not a dependency of the package (Nuxt brings it): the composable tests take Nuxt's copy.
const fromNuxt = createRequire(fileURLToPath(new URL('./node_modules/nuxt/package.json', import.meta.url)))

export default defineConfig({
  resolve: {
    alias: {
      // The registry the module generates, as the unit tests of the server helpers see it.
      '#maps/server-registry': fileURLToPath(new URL('./test/server-registry.ts', import.meta.url)),
      'vue': fromNuxt.resolve('vue'),
    },
  },
})
