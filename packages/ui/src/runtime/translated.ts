/** A text that is either one string for every language, or a map of locale -> text. */
export type Translated = string | Record<string, string>

/**
 * Picks the text to show for `locale`: that locale, else `fallback` (the site's default locale), else `en`,
 * else the first entry that has text. Empty entries never win, so a half-translated value shows another language
 * instead of nothing.
 */
export function translate(value: Translated | null | undefined, locale = 'en', fallback?: string): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[locale] || (fallback ? value[fallback] : '') || value.en || Object.values(value).find(Boolean) || ''
}

/** True when `value` holds text for exactly that locale (no fallback). */
export function hasTranslation(value: Translated | null | undefined, locale: string): boolean {
  return !!value && (typeof value === 'string' ? false : !!value[locale])
}

/** Reads the text for one locale out of a translatable value; a plain string counts as the text of every locale. */
export function readTranslated(value: Translated | null | undefined, locale: string): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[locale] ?? ''
}

/** Writes the text for one locale; plain strings stay plain, per-locale maps keep their other locales. Empty entries are dropped. */
export function writeTranslated(value: Translated | null | undefined, locale: string, text: string): Translated | undefined {
  if (value && typeof value === 'object') {
    const next = Object.fromEntries(Object.entries({ ...value, [locale]: text }).filter(([, entry]) => entry))
    return Object.keys(next).length ? next : undefined
  }
  return text || undefined
}

/** A plain string becomes a per-locale map holding that text for `locale`. */
export function expandTranslated(value: Translated | null | undefined, locale: string): Translated | undefined {
  if (typeof value !== 'string') return value ?? undefined
  return value ? { [locale]: value } : undefined
}

/** A per-locale map becomes one plain string: the text of `locale`, else `en`, else the first one written. */
export function collapseTranslated(value: Translated | null | undefined, locale: string): Translated | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return value[locale] || value.en || Object.values(value).find(Boolean) || undefined
}

/** The locales of a value that actually have text. */
export function filledLocales(value: Translated | null | undefined): string[] {
  return value && typeof value === 'object' ? Object.keys(value).filter(code => value[code]) : []
}

/** Accepts `da`, `en-GB`, `pt_BR`... */
export const isLocaleCode = (code: string) => /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(code)
