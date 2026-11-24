import { fileURLToPath } from 'node:url'
import { defineNuxtModule } from '@nuxt/kit'
import { addAuthResolver } from '../../../../src/runtime/utils/build'

// Stands in for `@frigear-nu/oauth-resource`: resource mode needs a bearer resolver.
export default defineNuxtModule({
  meta: { name: 'test-resolver' },
  setup(_options, nuxt) {
    addAuthResolver(nuxt, { name: 'test', jwt: true, resolver: fileURLToPath(new URL('../server/resolvers/test', import.meta.url)) })
  },
})
