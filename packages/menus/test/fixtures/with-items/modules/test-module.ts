import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendMenu, registerMenuSource } from '../../../../src/runtime/utils/menu'

export default defineNuxtModule({
  meta: { name: 'test-menu-items' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Static item, registered at build time directly via `extendMenu`.
    extendMenu(nuxt, 'dashboard', [{ label: 'Dashboard', to: '/', order: 1 }])

    // Dynamic items, resolved at runtime (e.g. needing `useRuntimeConfig`) via a source file.
    registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard' })
  },
})
