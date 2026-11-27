import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { campaignsAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.campaigns as { pages?: { adminLists?: string, account?: string } } | undefined

  // The staff entry of the admin sidebar (`@frigear-nu/admin`), in the Manage group; the pages and the API check access
  // themselves.
  if (config?.pages?.adminLists) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'campaigns-lists',
      label: 'Newsletters',
      labelKey: 'campaigns.menu.admin.label',
      description: 'Newsletter lists, their signup and their subscribers.',
      descriptionKey: 'campaigns.menu.admin.description',
      icon: 'i-lucide-newspaper',
      to: config.pages.adminLists,
      permission: campaignsAccess.permissions.manage,
      order: 40,
    }))
  }

  // The signed-in user's newsletters, in the account area.
  if (config?.pages?.account) {
    extendMenuItem('account', defineMenuItem({
      id: 'newsletters',
      label: 'Newsletters',
      labelKey: 'campaigns.menu.account.label',
      description: 'Choose the newsletters you get.',
      descriptionKey: 'campaigns.menu.account.description',
      icon: 'i-lucide-newspaper',
      to: config.pages.account,
      order: 26,
    }))
  }
})
