import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`), as the `account` menu source.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.push as { pages?: { devices?: string } } | undefined

  if (config?.pages?.devices) {
    extendMenuItem('account', defineMenuItem({
      id: 'devices',
      label: 'Devices',
      labelKey: 'push.menu.devices.label',
      description: 'The phones that get your push notifications.',
      descriptionKey: 'push.menu.devices.description',
      icon: 'i-lucide-smartphone',
      to: config.pages.devices,
      order: 26,
    }))
  }
})
