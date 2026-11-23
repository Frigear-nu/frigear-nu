import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.oauthServer as { pages?: { applications?: string, admin?: string }, applicationsMenu?: string } | undefined

  // The user's applications: an area of the signed-in hub (`dashboard` menu) when the page is there, else the account
  // area's tile and left navigation. The page's heading uses the same keys as the item.
  if (config?.pages?.applications) {
    const hub = config.applicationsMenu === 'dashboard'
    extendMenuItem(hub ? 'dashboard' : 'account', defineMenuItem({
      id: 'oauth-applications',
      label: hub ? 'Apps' : 'Applications',
      labelKey: hub ? 'oauthServer.menu.apps.label' : 'oauthServer.menu.applications.label',
      description: 'Applications you can sign in to.',
      descriptionKey: hub ? 'oauthServer.menu.apps.description' : 'oauthServer.menu.applications.description',
      icon: 'i-lucide-layout-grid',
      to: config.pages.applications,
      order: 50,
    }))
  }

  // The admin entry is only a link, hidden from users without `oauth:manage`: the pages and API check it again. One
  // item for the whole area (the pages switch between applications and scopes with tabs), in the Settings group of the
  // `@frigear-nu/admin` sidebar (a plain menu, so this works whether or not that module is installed). It stays
  // highlighted on the scopes page, since the sidebar matches by prefix.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav.settings', defineMenuItem({
      id: 'oauth-admin',
      label: 'OAuth',
      labelKey: 'oauthServer.menu.admin.label',
      description: 'Applications that sign in with this site, and the scopes they can request.',
      descriptionKey: 'oauthServer.menu.admin.description',
      icon: 'i-lucide-key-round',
      to: config.pages.admin,
      order: 40,
      permission: 'oauth:manage',
    }))
  }
})
