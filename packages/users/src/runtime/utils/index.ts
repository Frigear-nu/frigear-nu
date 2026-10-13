import { addServerHandler, hasNuxtModule } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import type { TabDefinition, WidgetDefinition } from '@frigear-nu/widget/utils'

export interface UsersAdminExtension {
  /** Staff routes on the user, mounted at `/api/admin/users/:id/<path>`. Handlers are absolute paths. */
  routes?: { method: 'get' | 'post' | 'patch' | 'delete', path: string, handler: string }[]
  /** A tab on the admin user page (`admin.users`). Needs `@frigear-nu/widget` and `@frigear-nu/admin`; skipped without them. */
  tab?: TabDefinition
  /** A card on the overview tab of the admin user page (`admin.users.overview`). Needs `@frigear-nu/widget` and `@frigear-nu/admin`. */
  widget?: WidgetDefinition
}

/**
 * Lets a module extend the admin user page of `@frigear-nu/users`: its own staff routes below
 * `/api/admin/users/:id/`, a tab and an overview card. Routes authorize with `loadUsersAdminTarget`.
 */
export async function extendUsersAdmin(nuxt: Nuxt, extension: UsersAdminExtension) {
  for (const { method, path, handler } of extension.routes ?? []) {
    addServerHandler({ route: `/api/admin/users/:id/${path}`, method, handler })
  }
  if (!extension.tab && !extension.widget) return
  // The tab and card are built from the components of `@frigear-nu/admin` and only render on its admin user page.
  if (!hasNuxtModule('@frigear-nu/widget', nuxt) || !hasNuxtModule('@frigear-nu/admin', nuxt)) return

  const { extendTabs, extendWidgets } = await import('@frigear-nu/widget/utils')
  if (extension.tab) extendTabs(nuxt, 'admin.users', extension.tab)
  if (extension.widget) extendWidgets(nuxt, 'admin.users.overview', extension.widget)
}
