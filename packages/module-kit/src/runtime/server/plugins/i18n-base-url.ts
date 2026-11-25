import { fillI18nBaseUrl } from '../i18n-base-url'

// The i18n base URL of previews comes from the request (`fillI18nBaseUrl`). Nuxt renders with `useRuntimeConfig(event)`,
// a copy per request on Nitro v2 that is also serialized into the payload, so setting it here leaks into no other
// request. Never while prerendering: the origin there is the build host, so prerendered pages still need `site.url`.
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return
  nitroApp.hooks.hook('request', (event) => {
    fillI18nBaseUrl(event, useRuntimeConfig(event))
  })
})
