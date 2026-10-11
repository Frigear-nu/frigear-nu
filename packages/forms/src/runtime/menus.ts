import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.forms as { pages?: { admin?: string } } | undefined

  if (config?.pages?.admin) {
    extendMenuItem('dashboard.account', defineMenuItem({
      id: 'forms-admin',
      label: 'Forms',
      labelKey: 'forms.menu.admin.label',
      description: 'Manage forms and their submissions.',
      descriptionKey: 'forms.menu.admin.description',
      icon: 'i-lucide-clipboard-list',
      to: config.pages.admin,
      tags: ['admin'],
      order: 90,
    }))
  }
})
