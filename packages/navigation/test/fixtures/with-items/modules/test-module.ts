import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { registerNavigationFile } from '../../../../src/runtime/utils/register'

export default defineNuxtModule({
  meta: { name: 'test-navigation-items' },
  async setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    await registerNavigationFile(nuxt, { resolver, file: './runtime/navigation' })
  },
})
