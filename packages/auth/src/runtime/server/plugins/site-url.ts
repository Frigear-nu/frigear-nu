// Emailed links need the public site URL in production (`authSiteOrigin`): say so at startup, not only when the first
// reset or sign-in link fails.
export default defineNitroPlugin(() => {
  if (import.meta.dev) return
  if (configuredAuthSiteOrigin() || useRuntimeConfig().authentication?.trustRequestOrigin === true) return
  console.warn('[@frigear-nu/auth] No site URL is configured (NUXT_PUBLIC_SITE_URL): password reset, sign-in and verification emails fail with a 500 until it is set.')
})
