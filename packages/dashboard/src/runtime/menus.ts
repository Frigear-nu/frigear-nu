import { extendMenuItem, defineMenuSource } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// Only registered when `@frigear-nu/menu` is installed and the hub is on (see `module.ts`), so the import above is
// always resolvable when this file runs. Other modules add their areas to the `dashboard` menu the same way.
export default defineMenuSource(() => {
  const path = useRuntimeConfig().public.dashboard?.pages?.home
  if (!path) return

  extendMenuItem('account.dropdown', {
    id: 'dashboard',
    label: 'Dashboard',
    labelKey: 'dashboard.menu.dashboard.label',
    description: 'Your shortcuts and overview.',
    descriptionKey: 'dashboard.menu.dashboard.description',
    icon: 'i-lucide-layout-dashboard',
    to: path,
    order: -100,
  })

  // The first entry of the hub navigation: the hub page itself.
  extendMenuItem('dashboard', {
    id: 'dashboard-overview',
    label: 'Overview',
    labelKey: 'dashboard.menu.overview.label',
    description: 'Your shortcuts and overview.',
    descriptionKey: 'dashboard.menu.overview.description',
    icon: 'i-lucide-layout-dashboard',
    to: path,
    order: 0,
  })
})
