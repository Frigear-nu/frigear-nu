import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { crewAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.crew as { pages?: { home?: string } } | undefined

  // The crew home (its tabs: overview, my crew, my shifts, swaps) as an area of the signed-in hub. The `dashboard` menu
  // is only shown by `@frigear-nu/dashboard`'s hub.
  if (config?.pages?.home) {
    extendMenuItem('dashboard', defineMenuItem({
      id: 'crew',
      label: 'Crew',
      labelKey: 'crew.menu.home.label',
      description: 'Your crew places, your shifts and swaps.',
      descriptionKey: 'crew.menu.home.description',
      icon: 'i-lucide-hand-heart',
      to: config.pages.home,
      permission: crewAccess.permissions.read,
      order: 20,
    }))
  }
})
