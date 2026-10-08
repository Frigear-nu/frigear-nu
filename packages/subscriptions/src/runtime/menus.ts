import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.subscriptions as { pages?: { membership?: string } } | undefined

  if (config?.pages?.membership) {
    const item = defineMenuItem({
      id: 'subscription',
      label: 'Subscription',
      description: 'Manage your plan and billing.',
      icon: 'i-lucide-credit-card',
      to: config.pages.membership,
      order: 30,
    })

    extendMenuItem('account', item)
    extendMenuItem('dashboard.account', item)
  }
})
