import { defineMenuSource } from '@frigear-nu/menus/utils'

// Only registered when `@frigear-nu/menus` is installed (see `module.ts`), so the import above
// is always resolvable when this file actually runs.
export default defineMenuSource((items) => {
  const config = useRuntimeConfig().public.account

  if (config?.pages?.profile) {
    extendMenuItem('dashboard.account', {
      id: 'account.profile',
      label: 'Profile',
      description: 'Manage your profile details and email address.',
      icon: 'i-lucide-user-round-pen',
      to: config.pages.profile,
      order: 1,
    })
  }

  if (config?.pages?.security) {
    extendMenuItem('dashboard.account', {
      id: 'account.security',
      label: 'Security',
      description: 'Change your password and manage passkeys.',
      icon: 'i-lucide-shield-user',
      to: config.pages.security,
      order: 2,
    })
  }
})
