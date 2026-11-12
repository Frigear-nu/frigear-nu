import { useAuthorization } from '../composables/useAuthorization'
import { defineNuxtPlugin } from '#imports'

// Hides menu items whose `permission` the viewer does not hold (`menus:filter` of `@frigear-nu/menu`). The route behind
// an item still checks the permission itself.
export default defineNuxtPlugin({
  name: 'authorization:menu-filter',
  setup(nuxtApp) {
    type MenuItem = { permission?: string, children?: MenuItem[] }
    type MenuFilterContext = { items: MenuItem[] }
    const { can } = useAuthorization()
    const visible = (items: MenuItem[]): MenuItem[] => items
      .filter(item => !item.permission || can(item.permission))
      .map(item => Array.isArray(item.children) ? { ...item, children: visible(item.children) } : item)
    const hooks = nuxtApp.hooks as unknown as { hook: (name: 'menus:filter', fn: (ctx: MenuFilterContext) => void) => void }
    hooks.hook('menus:filter', (ctx) => {
      ctx.items = visible(ctx.items)
    })
  },
})
