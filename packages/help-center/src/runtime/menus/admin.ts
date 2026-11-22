import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { helpCenterAccess } from '../access'

// Only registered when `@frigear-nu/menu` is installed and `pages.admin` is on (see `module.ts`), as an `admin.nav` source.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.helpCenter as { pages?: { admin?: string } } | undefined

  // The staff entry of the admin sidebar (`@frigear-nu/admin`); the page and API check `help-center:manage` themselves.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'help-center-admin',
      label: 'Help center',
      labelKey: 'helpCenter.menu.admin.label',
      description: 'Manage help articles, categories and onboarding checklists.',
      descriptionKey: 'helpCenter.menu.admin.description',
      icon: 'i-lucide-life-buoy',
      to: config.pages.admin,
      permission: helpCenterAccess.permissions.manage,
      order: 36,
    }))
  }
})
