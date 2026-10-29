import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`), as the `account` menu source.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.subscriptions as { pages?: { membership?: string } } | undefined

  if (config?.pages?.membership) {
    extendMenuItem('account', defineMenuItem({
      id: 'membership',
      label: 'Membership',
      labelKey: 'subscriptions.menu.membership.label',
      description: 'Manage your plan and billing.',
      descriptionKey: 'subscriptions.menu.membership.description',
      icon: 'i-lucide-credit-card',
      to: config.pages.membership,
      order: 15,
    }))
  }
})
