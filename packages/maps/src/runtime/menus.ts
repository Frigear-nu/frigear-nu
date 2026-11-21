import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { mapsAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.maps as { pages?: { admin?: string } } | undefined

  // The staff entry of the admin sidebar (`@frigear-nu/admin`); the page and API check `maps:manage` themselves.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'maps-admin',
      label: 'Maps',
      labelKey: 'maps.menu.admin.label',
      description: 'Site maps, floor plans and what is drawn on them.',
      descriptionKey: 'maps.menu.admin.description',
      icon: 'i-lucide-map',
      to: config.pages.admin,
      permission: mapsAccess.permissions.manage,
      order: 45,
    }))
  }
})
