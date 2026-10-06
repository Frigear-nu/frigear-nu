import { defineNuxtModule } from '@nuxt/kit'
import { extendMenu } from '@frigear-nu/menu/utils'

export default defineNuxtModule({
  setup(_, nuxt) {
    extendMenu(nuxt, 'account', [
      { label: 'Account', description: 'Manage your account', to: '/account' },
    ])
    extendMenu(nuxt, 'account.dropdown', [
      { label: 'Settings', description: 'Manage your account', to: '/settings' },
      { label: 'Billing', description: 'Manage your subscription', to: '/billing' },
      { label: 'Logout', description: 'Sign out of your account', to: '/logout' },
    ])
  },
})
