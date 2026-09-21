import type { Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { setupServerOauthRoutes } from './routing/oauth-server'
import { setupAdminOAuthApiRoutes } from './routing/oauth-admin'

export async function setup(nuxt: Nuxt, resolver: Resolver) {
  setupAdminOAuthApiRoutes(nuxt, resolver)
  setupServerOauthRoutes(nuxt, resolver)
}
