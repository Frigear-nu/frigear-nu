import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { operationsAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.operations as { pages?: { admin?: string } } | undefined

  // The staff entry of the admin sidebar (`@frigear-nu/admin`); the page and API check `operations:manage` themselves.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'operations-admin',
      label: 'Operations',
      labelKey: 'operations.menu.admin.label',
      description: 'Manage the occasions your organisation works at.',
      descriptionKey: 'operations.menu.admin.description',
      icon: 'i-lucide-tent',
      to: config.pages.admin,
      permission: operationsAccess.permissions.manage,
      order: 25,
    }))
  }
})
