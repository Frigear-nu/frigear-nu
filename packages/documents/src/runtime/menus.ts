import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.documents as { pages?: { documents?: string, admin?: string } } | undefined

  if (config?.pages?.documents) {
    // The tile on `/account`, in the spot the old `account.settings.documents` page used.
    extendMenuItem('account', defineMenuItem({
      id: 'documents',
      label: 'Documents',
      labelKey: 'documents.menu.documents.label',
      description: 'Handbooks and other files for you.',
      descriptionKey: 'documents.menu.documents.description',
      icon: 'i-lucide-files',
      to: config.pages.documents,
      order: 30,
    }))
  }

  if (config?.pages?.admin) {
    // The `@frigear-nu/admin` sidebar (a plain menu, so this works whether or not that module is installed).
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'documents-admin',
      label: 'Documents',
      labelKey: 'documents.menu.admin.label',
      description: 'Upload documents and share them with groups.',
      descriptionKey: 'documents.menu.admin.description',
      icon: 'i-lucide-files',
      to: config.pages.admin,
      order: 35,
    }))
  }
})
