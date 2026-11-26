import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { campaignsAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.campaigns as { pages?: { adminCampaigns?: string, adminLists?: string, account?: string } } | undefined

  // One staff entry for the area in the admin sidebar (`@frigear-nu/admin`), in the Manage group: the campaigns page,
  // whose heading has tabs to the newsletters (or the newsletters page when the campaigns page is off). The pages and
  // the API check access themselves.
  const adminPath = config?.pages?.adminCampaigns ?? config?.pages?.adminLists
  if (adminPath) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'campaigns',
      label: 'Campaigns',
      labelKey: 'campaigns.menu.admin.label',
      description: 'Newsletters and messages to subscribers and users, and the newsletter lists.',
      descriptionKey: 'campaigns.menu.admin.description',
      icon: 'i-lucide-megaphone',
      to: adminPath,
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
