// Metadata for the "simple" OAuth providers this module ships a route for. Kept as a plain
// object (rather than importing `@nuxt/ui`'s `ButtonProps`) so composables don't pull in a hard
// dependency on `@nuxt/ui` - the shape below is a structural subset of `ButtonProps` and can be
// spread directly into a `<UButton>` (or passed to `UAuthForm`'s `providers` prop) as-is.
export const OAUTH_PROVIDER_META = {
  github: { label: 'GitHub', icon: 'i-simple-icons-github', to: '/api/auth/github' },
  google: { label: 'Google', icon: 'i-simple-icons-google', to: '/api/auth/google' },
  facebook: { label: 'Facebook', icon: 'i-simple-icons-facebook', to: '/api/auth/facebook' },
  // Full page navigation (not the router): the route redirects to frigear.nu.
  frigear: { label: 'frigear.nu', icon: 'i-lucide-log-in', to: '/auth/frigear', external: true },
} as const

export type OAuthProviderKey = keyof typeof OAUTH_PROVIDER_META
