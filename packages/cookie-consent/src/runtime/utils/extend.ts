import type { Nuxt } from '@nuxt/schema'
import type { ConsentCategory } from '../../types'

/**
 * Lets another module contribute consent categories (or cookies to an existing one) during its own
 * `setup()`. Registrations are merged by `key` once every module has set up, so order doesn't
 * matter. Adding a category or cookie changes the consent version and re-prompts visitors.
 */
export function extendCookieConsent(nuxt: Nuxt, extension: { categories: ConsentCategory[] }) {
  nuxt.options.cookieConsent ||= {}
  nuxt.options.cookieConsent._categories ||= []
  nuxt.options.cookieConsent._categories.push(...extension.categories)
  void nuxt.callHook('cookie-consent:extend', extension.categories)
}

export const defineConsentCategory = <T extends ConsentCategory>(category: T): T => category
