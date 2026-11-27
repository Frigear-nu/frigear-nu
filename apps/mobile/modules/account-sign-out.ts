import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendWidgets } from '@frigear-nu/widget/utils'

// Sign-out on the Account tab: the last thing on Account's overview (`account.overview.end`, below its links). The
// website's account menu has it; the app has no such menu.
export default defineNuxtModule({
  meta: { name: 'app-account-sign-out' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    extendWidgets(nuxt, 'account.overview.end', {
      id: 'app-sign-out',
      component: resolver.resolve('../app/components/AccountSignOut.vue'),
    })
  },
})
