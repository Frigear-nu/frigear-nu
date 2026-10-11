import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.oauthServer as { pages?: { applications?: string, admin?: string } } | undefined

  if (config?.pages?.applications) {
    const item = defineMenuItem({
      id: 'oauth-applications',
      label: 'Applications',
      labelKey: 'oauthServer.menu.applications.label',
      description: 'Applications you can sign in to.',
      descriptionKey: 'oauthServer.menu.applications.description',
      icon: 'i-lucide-layout-grid',
      to: config.pages.applications,
      order: 50,
    })

    // `account` is rendered by the account dashboard, `dashboard.account` is the generic dashboard menu.
    extendMenuItem('account', item)
    extendMenuItem('dashboard.account', item)
  }

  // The admin entry is only a link: the page and API stay gated by the `oauth:authorize` hook, so it
  // is tagged for the host to show it to staff only.
  if (config?.pages?.admin) {
    extendMenuItem('dashboard.account', defineMenuItem({
      id: 'oauth-admin',
      label: 'OAuth applications',
      labelKey: 'oauthServer.menu.admin.label',
      description: 'Manage the applications users can sign in to.',
      descriptionKey: 'oauthServer.menu.admin.description',
      icon: 'i-lucide-key-round',
      to: config.pages.admin,
      order: 90,
      tags: ['admin'],
    }))
  }
})
