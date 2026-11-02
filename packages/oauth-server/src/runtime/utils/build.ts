import type { Nuxt } from '@nuxt/schema'
import type { OAuthScopeDefinition } from '../../types'

// Build-time registration API for other modules' `setup()`. Registrations are collected through a hook and read once
// every module is installed, so the order in which modules are installed does not matter.

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'oauth-server:scopes': (scopes: OAuthScopeDefinition[]) => void | Promise<void>
  }
}

/**
 * Adds scopes to the OAuth server's scope registry: they are advertised, may be requested, and are shown on the consent
 * screen grouped by `service`. `staffOnly` scopes are only granted to the users the `oauth:scope:staff` hook allows.
 *
 *     addOAuthScope(nuxt, { name: 'vouchers:read', description: 'See your vouchers', service: 'Vouchers' })
 */
export function addOAuthScope(nuxt: Nuxt, ...scopes: OAuthScopeDefinition[]) {
  nuxt.hook('oauth-server:scopes', (list) => {
    list.push(...scopes)
  })
}
