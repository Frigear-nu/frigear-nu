import type { ConsentCategory, ConsentState, ModuleOptions, PublicModuleOptions } from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    cookieConsent?: ModuleOptions
  }

  interface NuxtOptions {
    cookieConsent?: ModuleOptions & {
      _categories?: ConsentCategory[]
    }
  }

  interface PublicRuntimeConfig {
    cookieConsent?: PublicModuleOptions
  }

  interface NuxtHooks {
    /** Called every time `extendCookieConsent` registers categories. */
    'cookie-consent:extend': (categories: ConsentCategory[]) => void
    /**
     * Called once after every module has set up, with the final merged category list. Mutate the
     * array to adjust it; the consent version is derived from it afterwards.
     */
    'cookie-consent:resolved': (categories: ConsentCategory[]) => void
  }
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /** Called on the client when the visitor saves a choice (accept, reject, preferences or withdraw). */
    'cookie-consent:change': (state: ConsentState | null, previous: ConsentState | null) => void
    /** Called once on the client with the stored consent (or `null` if still undecided). */
    'cookie-consent:ready': (state: ConsentState | null) => void
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Called on the server after a signed-in user's consent was stored. */
    'cookie-consent:saved': (payload: {
      userId: number | string
      state: ConsentState
      acceptedAt: number
    }) => void | Promise<void>
  }
}

export {}
