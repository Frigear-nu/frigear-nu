import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// Only registered when `@frigear-nu/menu` is installed and the signed-in area has a menu (see `module.ts`): the `account`
// menu when the area is under `/account`, `settings.signedInMenu` anywhere else (the hub's `dashboard` menu by default when the
// area is in the hub). The target menu is `public.helpCenter.menu`.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.helpCenter as { menu?: string | null, pages?: { signedIn?: string } } | undefined
  if (!config?.menu || !config.pages?.signedIn) return

  extendMenuItem(config.menu, defineMenuItem({
    id: 'help-center',
    label: 'Help center',
    labelKey: 'helpCenter.menu.signedIn.label',
    description: 'Guides, onboarding and answers for you.',
    descriptionKey: 'helpCenter.menu.signedIn.description',
    icon: 'i-lucide-life-buoy',
    to: config.pages.signedIn,
    order: 40,
  }))
})
