import { defineNuxtModule } from '@nuxt/kit'
import { extendMenu } from '@frigear-nu/menus/utils'

export default defineNuxtModule({
  setup(_, nuxt) {
    extendMenu(nuxt, 'header.dropdown', [
      { label: 'Settings', description: 'Manage your account', to: '/settings' },
      { label: 'Billing', description: 'Manage your subscription', to: '/billing' },
      { label: 'Logout', description: 'Sign out of your account', to: '/logout' },
    ])
  },
})
