import type { Nuxt } from '@nuxt/schema'
import type { AuthResolverDefinition, AuthScopeDefinition } from '../../types'

// Build-time registration API for other modules' `setup()`. Registrations are collected through
// hooks and read lazily when the server templates are generated, so the order in which modules
// are installed does not matter.

export interface AuthUserLoaderRegistration {
  /** Absolute path to a module whose default export loads a user by id. */
  path?: string
}

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'auth:resolvers': (resolvers: AuthResolverDefinition[]) => void | Promise<void>
    'auth:scopes': (scopes: AuthScopeDefinition[]) => void | Promise<void>
    'auth:user-loader': (registration: AuthUserLoaderRegistration) => void | Promise<void>
  }
}

/** Register a bearer-token resolver (e.g. OAuth access tokens). The resolver path must be absolute. */
export function addAuthResolver(nuxt: Nuxt, resolver: AuthResolverDefinition) {
  if (!resolver.prefix && !resolver.jwt) {
    throw new Error(`[auth] Resolver "${resolver.name}" must claim tokens with a "prefix" or "jwt: true".`)
  }
  nuxt.hook('auth:resolvers', (resolvers) => {
    resolvers.push(resolver)
  })
}

/** Declare scopes that user tokens can be granted (shown in the token UI). */
export function addAuthScope(nuxt: Nuxt, ...scopes: AuthScopeDefinition[]) {
  nuxt.hook('auth:scopes', (list) => {
    list.push(...scopes)
  })
}

/** Provide how a user is loaded by id when a bearer credential names one. First registration wins. */
export function setAuthUserLoader(nuxt: Nuxt, path: string) {
  nuxt.hook('auth:user-loader', (registration) => {
    registration.path ||= path
  })
}
