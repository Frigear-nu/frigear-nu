import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendWidgets } from '@frigear-nu/widget/utils'

// Sign-out on the Account tab: a widget at the end of Account's overview (`account.overview`). The website's account
// menu has it there; the app has no such menu.
export default defineNuxtModule({
  meta: { name: 'app-account-sign-out' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    extendWidgets(nuxt, 'account.overview', {
      id: 'app-sign-out',
      component: resolver.resolve('../app/components/AccountSignOut.vue'),
      order: 1000,
    })
  },
})
