import type { Translated } from '../../types'

export * from './api'
export * from './consent'
export * from './schemas'
export * from './links'
export * from './delivery'

/**
 * Picks the text to show for `locale`: that locale, else `fallback`, else `en`, else the first entry with text.
 * Empty entries never win.
 */
export function translate(value: Translated | null | undefined, locale = 'en', fallback?: string): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[locale] || (fallback ? value[fallback] : '') || value.en || Object.values(value).find(Boolean) || ''
}
export * from './forms'
