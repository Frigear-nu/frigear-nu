import { defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`), so the import above
// is always resolvable when this file actually runs.
export default defineMenuSource(() => {
  // const config = useRuntimeConfig().public.users

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
