import type { Permission } from '@frigear-nu/auth/access'
import { useAuthorization } from '../composables/useAuthorization'
import { defineNuxtPlugin } from '#imports'

// Hides widgets and tabs whose `permission` the viewer does not hold (`widgets:filter` / `tabs:filter` of
// `@frigear-nu/widget`). Only what is shown: the data behind a widget or tab still checks the permission itself.
export default defineNuxtPlugin({
  name: 'authorization:widget-filter',
  setup(nuxtApp) {
    type Entry = { permission?: Permission }
    type Hooks = {
      hook: ((name: 'widgets:filter', fn: (ctx: { widgets: Entry[] }) => void) => void)
        & ((name: 'tabs:filter', fn: (ctx: { tabs: Entry[] }) => void) => void)
    }
    const { can } = useAuthorization()
    const visible = (entry: Entry) => !entry.permission || can(entry.permission)
    const hooks = nuxtApp.hooks as unknown as Hooks
    hooks.hook('widgets:filter', (ctx) => {
      ctx.widgets = ctx.widgets.filter(visible)
    })
    hooks.hook('tabs:filter', (ctx) => {
      ctx.tabs = ctx.tabs.filter(visible)
    })
  },
})
