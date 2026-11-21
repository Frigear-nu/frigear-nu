import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { teamsAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.teams as { pages?: { admin?: string } } | undefined

  // The staff entry of the admin sidebar (`@frigear-nu/admin`); the page and API check `teams:manage` themselves.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'teams-admin',
      label: 'Teams',
      labelKey: 'teams.menu.admin.label',
      description: 'Teams, their members and role mapping rules.',
      descriptionKey: 'teams.menu.admin.description',
      icon: 'i-lucide-users-round',
      to: config.pages.admin,
      permission: teamsAccess.permissions.manage,
      order: 26,
    }))
  }
})
