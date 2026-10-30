import type { MenuItem } from '@frigear-nu/menu'
import { computed, useLocaleLink, useModuleT, useNavLinks, useRuntimeConfig } from '#imports'
import { useMenu } from '#account/optional'

/** An entry of the account navigation: an item of the `account` menu, or a configured page without the menu module. */
export interface AccountNavItem {
  id: string
  label: string
  description?: string
  icon?: string
  to: string
  external?: boolean
}

/**
 * The account navigation: the items of the `account` menu (so pages other modules add show up too), or, without
 * `@frigear-nu/menu`, the account pages enabled in `account.settings.pages`. `links` are ready for
 * `UNavigationMenu`/`PageSectionSwitcher` (localised, `active` set, the overview only active on its own path) and `current` is
 * the item the route belongs to. Await it, so the menu is resolved before the page renders on the server.
 */
export async function useAccountNav() {
  const t = useModuleT('account')
  const pages = useRuntimeConfig().public.account?.pages
  const { isActive, strip } = useLocaleLink()

  // `@frigear-nu/menu` is optional: without it `useMenu` is `undefined` and the configured pages are listed.
  const menu = typeof useMenu === 'function' ? useMenu('account') : undefined

  const fallback = (): AccountNavItem[] => [
    { id: 'account-overview', to: pages?.index, label: t('menu.overview.label', 'Overview'), description: t('menu.overview.description', 'A summary of your account.'), icon: 'i-lucide-layout-dashboard' },
    { id: 'profile', to: pages?.profile, label: t('menu.profile.label', 'Profile'), description: t('menu.profile.description', 'Manage your profile details and email address.'), icon: 'i-lucide-user-round-pen' },
    { id: 'security', to: pages?.security, label: t('menu.security.label', 'Security'), description: t('menu.security.description', 'Change your password and manage passkeys.'), icon: 'i-lucide-shield-user' },
    { id: 'api-tokens', to: pages?.apiTokens, label: t('menu.apiTokens.label', 'API tokens'), description: t('menu.apiTokens.description', 'Create tokens for scripts and tools.'), icon: 'i-lucide-key-round' },
    { id: 'documents', to: pages?.documents, label: t('menu.documents.label', 'Documents'), description: t('menu.documents.description', 'Handbooks and other files for you.'), icon: 'i-lucide-files' },
  ].filter((item): item is typeof item & { to: string } => !!item.to)

  const items = computed<AccountNavItem[]>(() => menu
    ? (menu.data.value ?? [])
        .filter((item): item is MenuItem & { to: string } => !!item.to)
        .map(item => ({ id: item.id ?? item.to, label: item.label, description: item.description, icon: item.icon, to: item.to, external: item.external }))
    : fallback())

  // The overview sits at the area's base path, so it is only active there.
  const links = useNavLinks(items, { exact: pages?.index ? [pages.index] : [] })

  // The most specific item containing the route: `/account/membership/success` belongs to Membership.
  const current = computed<AccountNavItem | undefined>(() => items.value
    .filter(item => !item.external && isActive(item.to, { exact: item.to === pages?.index }))
    .sort((a, b) => strip(b.to).length - strip(a.to).length)[0])

  if (menu) await menu

  return { items, links, current }
}
