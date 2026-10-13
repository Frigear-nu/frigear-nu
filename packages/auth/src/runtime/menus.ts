import { defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

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
    to: '/auth/logout',
    external: true,
    order: 99,
  })
})
