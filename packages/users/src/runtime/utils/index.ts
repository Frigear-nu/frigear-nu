import { addServerHandler, hasNuxtModule } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import type { TabDefinition, WidgetDefinition } from '@frigear-nu/widget/utils'

export interface UsersAdminExtension {
  /** Staff routes on the user, mounted at `/api/admin/users/:id/<path>`. Handlers are absolute paths. */
  routes?: { method: 'get' | 'post' | 'patch' | 'delete', path: string, handler: string }[]
  /** A tab on the admin user page (`admin.users`). Needs `@frigear-nu/widget`; skipped without it. */
  tab?: TabDefinition
  /** A card on the overview tab of the admin user page (`admin.users.overview`). Needs `@frigear-nu/widget`. */
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
  if (!hasNuxtModule('@frigear-nu/widget', nuxt)) return

  const { extendTabs, extendWidgets } = await import('@frigear-nu/widget/utils')
  if (extension.tab) extendTabs(nuxt, 'admin.users', extension.tab)
  if (extension.widget) extendWidgets(nuxt, 'admin.users.overview', extension.widget)
}
