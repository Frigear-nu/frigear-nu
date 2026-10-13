import type { Nuxt } from '@nuxt/schema'

// Build-time registration API for other modules' `setup()`. Registrations are collected through a hook and read
// lazily when the templates are generated, so the order in which modules are installed does not matter.

export interface PreferenceDefinitionSource {
  /** Absolute path to a file that default-exports `definePreferences({...})`. */
  path: string
}

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'preferences:definitions': (sources: PreferenceDefinitionSource[]) => void | Promise<void>
  }
}

/**
 * Register a definer file. Its keys become part of `UserPreferences`, are validated by the preferences API, and
 * forwarded as OAuth claims where the definition says so.
 *
 *     addUserPreferences(nuxt, { path: resolver.resolve('./runtime/preferences') })
 */
export function addUserPreferences(nuxt: Nuxt, source: PreferenceDefinitionSource) {
  nuxt.hook('preferences:definitions', (sources) => {
    sources.push(source)
  })
}
