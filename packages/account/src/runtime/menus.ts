import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menus/utils'

// Only registered when `@frigear-nu/menus` is installed (see `module.ts`), so the import above
// is always resolvable when this file actually runs.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.account

  if (config?.pages?.index) {
    extendMenuItem('account.dropdown', {
      id: 'account',
      label: 'Account',
      description: 'Your account.',
      icon: 'i-lucide-layout-dashboard',
      to: config.pages.index,
      order: -99,
    })
  }

  if (config?.pages?.profile) {
    const profileItem = defineMenuItem({
      id: 'profile',
      label: 'Profile',
      description: 'Manage your profile details and email address.',
      icon: 'i-lucide-user-round-pen',
      to: config.pages.profile,
      order: 10,
    })

    extendMenuItem('account', profileItem)
    extendMenuItem('account.dropdown', profileItem)
  }

  if (config?.pages?.security) {
    extendMenuItem('account', {
      id: 'security',
      label: 'Security',
      description: 'Change your password and manage passkeys.',
      icon: 'i-lucide-shield-user',
      to: config.pages.security,
      order: 20,
    })
  }
})
