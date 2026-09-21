import type { OAuthServerModuleOptions, OAuthServerModulePublicOptions } from './types'

declare module 'nuxt/schema' {

  interface RuntimeConfig {
    oAuthServer: OAuthServerModuleOptions
  }
  interface PublicRuntimeConfig {
    oAuthServer: OAuthServerModulePublicOptions
  }
}
