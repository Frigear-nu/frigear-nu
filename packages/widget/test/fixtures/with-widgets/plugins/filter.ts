// Hides every widget and tab that requires something this (anonymous) visitor doesn't have, and every one whose
// `permission` is not in the `x-test-permissions` header (stands in for `@frigear-nu/authorization`'s listeners).
export default defineNuxtPlugin((nuxtApp) => {
  const header = useRequestHeaders(['x-test-permissions'])['x-test-permissions']
  const permissions = header ? header.split(',') : []
  const allowed = (item: { requires?: string, permission?: string }) => !item.requires && (!item.permission || permissions.includes(item.permission))
  nuxtApp.hook('widgets:filter', (ctx) => {
    ctx.widgets = ctx.widgets.filter(allowed)
  })
  nuxtApp.hook('tabs:filter', (ctx) => {
    ctx.tabs = ctx.tabs.filter(allowed)
  })
})
