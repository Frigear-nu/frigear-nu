// Hides every widget and tab that requires something this (anonymous) visitor doesn't have.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('widgets:filter', (ctx) => {
    ctx.widgets = ctx.widgets.filter(widget => !widget.requires)
  })
  nuxtApp.hook('tabs:filter', (ctx) => {
    ctx.tabs = ctx.tabs.filter(tab => !tab.requires)
  })
})
