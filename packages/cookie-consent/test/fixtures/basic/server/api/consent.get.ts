export default defineEventHandler(event => ({
  consent: getCookieConsent(event),
  analytics: hasCookieConsent(event, 'analytics'),
  version: useRuntimeConfig().public.cookieConsent?.version,
  categories: useRuntimeConfig().public.cookieConsent?.categories.map(category => category.key),
}))
