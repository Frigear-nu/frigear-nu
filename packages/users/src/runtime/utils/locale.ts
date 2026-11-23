// The language rule of `@frigear-nu/users`, framework free so the server schemas, the profile page and other modules
// share it.

/** The longest language tag stored on a user. */
export const USER_LOCALE_MAX_LENGTH = 20

/** A short BCP-47 language tag: a 2-3 letter language and up to two subtags (`da`, `en-GB`, `zh-Hant-TW`). */
export const USER_LOCALE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i

/**
 * `value` as `users.locale` stores it, or `null` when it is not a language the app accepts. With `known` (the app's
 * i18n locale codes) only those count, matched without regard to case and returned as the app spells them. Without
 * them, any short BCP-47 tag counts (`USER_LOCALE_PATTERN`), as given.
 */
export function normalizeUserLocale(value: unknown, known: readonly string[] = []): string | null {
  if (typeof value !== 'string') return null
  const tag = value.trim()
  if (!tag || tag.length > USER_LOCALE_MAX_LENGTH) return null
  if (known.length) return known.find(code => code.toLowerCase() === tag.toLowerCase()) ?? null
  return USER_LOCALE_PATTERN.test(tag) ? tag : null
}
