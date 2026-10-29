import { defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { authApi } from './utils/api'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`), so the import above
// is always resolvable when this file actually runs.
export default defineMenuSource(() => {
  extendMenuItem('account.dropdown', {
    id: 'logout',
    label: 'Logout',
    labelKey: 'auth.menu.logout.label',
    description: 'Sign out of your account.',
    descriptionKey: 'auth.menu.logout.description',
    icon: 'i-lucide-log-out',
    // An action, not a link: the dropdown posts to it, then reloads the home page.
    to: authApi.logout,
    method: 'post',
    order: 99,
  })
})
