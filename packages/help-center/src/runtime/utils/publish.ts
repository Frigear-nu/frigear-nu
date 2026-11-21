import type { MissingTranslations, Translated } from '../../types'

/** The locales an article needs in both `title` and `body` before it can be published, unless the host sets `requiredLocales`. */
export const DEFAULT_REQUIRED_LOCALES = ['da', 'en'] as const

/**
 * Whether a translated value holds text for exactly `locale`. A plain string does not count: it is one text for every
 * language, and the publish rule exists to make sure each language was written on purpose.
 */
export function hasLocaleText(value: Translated | null | undefined, locale: string): boolean {
  if (!value || typeof value === 'string') return false
  return typeof value[locale] === 'string' && value[locale]!.trim().length > 0
}

/**
 * What an article still lacks to be published: for `title` and for `body`, the required locales with no text.
 * Empty when it can be published.
 */
export function missingTranslations(
  article: { title: Translated | null | undefined, body: Translated | null | undefined },
  requiredLocales: readonly string[] = DEFAULT_REQUIRED_LOCALES,
): MissingTranslations {
  const missing: MissingTranslations = []
  for (const field of ['title', 'body'] as const) {
    const locales = requiredLocales.filter(locale => !hasLocaleText(article[field], locale))
    if (locales.length) missing.push({ field, locales })
  }
  return missing
}

/** The message of a `missing_translations` error, naming each field and its missing languages. */
export function describeMissingTranslations(missing: MissingTranslations): string {
  const parts = missing.map(entry => `${entry.field} (${entry.locales.join(', ')})`)
  return `An article needs text in every required language before it is published. Missing: ${parts.join('; ')}.`
}
