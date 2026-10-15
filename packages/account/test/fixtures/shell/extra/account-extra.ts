import { createResolver, defineNuxtModule, extendPages } from '@nuxt/kit'
import { extendMenu } from '@frigear-nu/menu/utils'

// Stands in for a module that adds a page to the account area (like membership or tickets): a route under /account
// and an item in the `account` menu, nothing else.
export default defineNuxtModule({
  meta: { name: 'test-account-extra' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    extendPages((pages) => {
      pages.push({ name: 'account-extra', path: '/account/extra', file: resolver.resolve('./runtime/ExtraPage.vue') })
    })
    extendMenu(nuxt, 'account', {
      id: 'extra',
      label: 'Extra things',
      description: 'Added by another module.',
      icon: 'i-lucide-star',
      to: '/account/extra',
      order: 60,
    })
  },
})
