import {
  defineNuxtModule,
  createResolver,
  addImports,
  addServerImports,
} from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'config',
  },
  setup() {
    const { resolve } = createResolver(import.meta.url)
  },
})
