import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menus/utils'

// Only registered when `@frigear-nu/menus` is installed (see `module.ts`), so the import above
// is always resolvable when this file actually runs.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.users
  const { clear } = useUserSession()

  extendMenuItem('account.dropdown', {
    id: 'logout',
    label: 'Logout',
    description: 'Sign out of your account.',
    icon: 'i-lucide-log-out',
    to: '/auth/logout',
    external: true,
    order: 99,
  })
})
