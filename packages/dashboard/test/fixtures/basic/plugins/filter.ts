// Hides every widget whose `permission` is not in the `x-test-permissions` header (stands in for
// `@frigear-nu/authorization`'s `widgets:filter` listener).
export default defineNuxtPlugin((nuxtApp) => {
  const header = useRequestHeaders(['x-test-permissions'])['x-test-permissions']
  const permissions = header ? header.split(',') : []
  nuxtApp.hook('widgets:filter', (ctx) => {
    ctx.widgets = ctx.widgets.filter(widget => !widget.permission || permissions.includes(widget.permission))
  })
})
