/** The `localStorage` key holding the sign-in and language last applied (`localeToApply`). */
export const APPLIED_LOCALE_KEY = 'auth-client:locale'

/**
 * `saved` (the user's `locale` claim) as one of the app's i18n locales: an exact match without regard to case, else
 * its language (`en-GB` → `en`). `null` when it is none of them.
 */
export function matchAppLocale(saved: unknown, locales: readonly string[]): string | null {
  const value = typeof saved === 'string' ? saved.trim().toLowerCase() : ''
  if (!value) return null
  const language = value.split(/[-_]/)[0]
  return locales.find(code => code.toLowerCase() === value)
    ?? locales.find(code => code.toLowerCase() === language)
    ?? null
}

/**
 * The locale to switch the app to for this sign-in (`sessionId`) and saved language, with the marker to store once it
 * is applied; `null` when there is none or it was applied already (`applied`, the stored marker). A new sign-in or a
 * newly saved language applies again; a switch the user made in the app afterwards is left alone.
 */
export function localeToApply(sessionId: string | null | undefined, saved: unknown, locales: readonly string[], applied: string | null): { locale: string, marker: string } | null {
  if (!sessionId) return null
  const locale = matchAppLocale(saved, locales)
  if (!locale) return null
  const marker = `${sessionId}:${locale}`
  return marker === applied ? null : { locale, marker }
}
