import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { shortLinksAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.shortLinks as { pages?: { admin?: string } } | undefined

  // The staff entry of the admin sidebar's Manage group (`@frigear-nu/admin`); the page and API check
  // `short-links:manage` themselves.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'short-links-admin',
      label: 'Short links',
      labelKey: 'shortLinks.menu.admin.label',
      description: 'Short links of every module, their clicks, and links made by hand.',
      descriptionKey: 'shortLinks.menu.admin.description',
      icon: 'i-lucide-link',
      to: config.pages.admin,
      permission: shortLinksAccess.permissions.manage,
      order: 80,
    }))
  }
})
