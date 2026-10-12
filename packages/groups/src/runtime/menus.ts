import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.groups as { pages?: { admin?: string } } | undefined

  if (config?.pages?.admin) {
    // The `@frigear-nu/admin` sidebar (a plain menu, so this works whether or not that module is installed).
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'groups-admin',
      label: 'Groups',
      labelKey: 'groups.menu.admin.label',
      description: 'Manage user groups and their members.',
      descriptionKey: 'groups.menu.admin.description',
      icon: 'i-lucide-users-round',
      to: config.pages.admin,
      order: 15,
    }))
  }
})
