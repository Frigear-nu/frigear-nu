import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`), as the `account` menu source.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.preferences as { pages?: { notifications?: string } } | undefined

  if (config?.pages?.notifications) {
    extendMenuItem('account', defineMenuItem({
      id: 'notifications',
      label: 'Notifications',
      labelKey: 'preferences.menu.notifications.label',
      description: 'Choose how we reach you: email, SMS or push.',
      descriptionKey: 'preferences.menu.notifications.description',
      icon: 'i-lucide-bell',
      to: config.pages.notifications,
      order: 25,
    }))
  }
})
