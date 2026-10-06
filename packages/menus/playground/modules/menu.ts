import { defineNuxtModule } from '@nuxt/kit'
import { extendMenu } from '@frigear-nu/menus/utils'

export default defineNuxtModule({
  setup(_, nuxt) {
    extendMenu(nuxt, 'main', [
      { label: 'Billing', description: 'Manage your subscription', to: '/billing' },
    ])
  },
})
