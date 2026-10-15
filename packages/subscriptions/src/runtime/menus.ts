import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`), as the `account` menu source.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.subscriptions as { pages?: { membership?: string } } | undefined

  if (config?.pages?.membership) {
    extendMenuItem('account', defineMenuItem({
      id: 'subscription',
      label: 'Subscription',
      labelKey: 'subscriptions.menu.subscription.label',
      description: 'Manage your plan and billing.',
      descriptionKey: 'subscriptions.menu.subscription.description',
      icon: 'i-lucide-credit-card',
      to: config.pages.membership,
      order: 15,
    }))
  }
})
