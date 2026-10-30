import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`), as the `account` menu source.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.oauthServer as { pages?: { applications?: string, admin?: string } } | undefined

  // The account area's tile and left navigation.
  if (config?.pages?.applications) {
    extendMenuItem('account', defineMenuItem({
      id: 'oauth-applications',
      label: 'Applications',
      labelKey: 'oauthServer.menu.applications.label',
      description: 'Applications you can sign in to.',
      descriptionKey: 'oauthServer.menu.applications.description',
      icon: 'i-lucide-layout-grid',
      to: config.pages.applications,
      order: 50,
    }))
  }

  // The admin entry is only a link: the page and API stay gated by the `oauth:authorize` hook. It lives in the
  // Settings group of the `@frigear-nu/admin` sidebar (a plain menu, so this works whether or not that module is installed).
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav.settings', defineMenuItem({
      id: 'oauth-admin',
      label: 'OAuth applications',
      labelKey: 'oauthServer.menu.admin.label',
      description: 'Manage the applications users can sign in to.',
      descriptionKey: 'oauthServer.menu.admin.description',
      icon: 'i-lucide-key-round',
      to: config.pages.admin,
      order: 40,
    }))
  }
})
