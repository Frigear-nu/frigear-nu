import { normalizeUserLocale } from '../../utils/locale'

/** The app's i18n locale codes, the languages `users.locale` accepts; empty without i18n (then any short BCP-47 tag). */
export function usersLocales(): string[] {
  return (useRuntimeConfig() as { users?: { locales?: string[] } }).users?.locales ?? []
}

/**
 * A language as `users.locale` stores it (the rule of the users routes: one of the app's i18n locales, else a short
 * BCP-47 tag), or `null` when `value` is not a string, is empty or breaks the rule. For modules that store a user's
 * language from their own input.
 */
export function parseUserLocale(value: unknown): string | null {
  return normalizeUserLocale(value, usersLocales())
}
