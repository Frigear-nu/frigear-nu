// Hides every widget that requires something this (anonymous) visitor doesn't have.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('widgets:filter', (ctx) => {
    ctx.widgets = ctx.widgets.filter(widget => !widget.requires)
  })
})
