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

/** The locale to switch the app to: the saved language when it is one of the app's and not the current one, else `null`. */
export function localeToApply(saved: unknown, current: string, locales: readonly string[]): string | null {
  const locale = matchAppLocale(saved, locales)
  return locale && locale !== current ? locale : null
}
