import type { Translated } from '../../types'

/** Picks the text for a locale, falling back to `en`, then to the first available entry. */
export function translate(value: Translated | null | undefined, locale = 'en'): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[locale] ?? value.en ?? Object.values(value)[0] ?? ''
}

export type TranslateParams = Record<string, string | number>

/** `(key, englishFallback, params) => text`, the shape of `useModuleT('forms')`. */
export type MessageTranslator = (key: string, fallback: string, params?: TranslateParams) => string

/** Replaces `{name}` placeholders. */
export function interpolate(text: string, params: TranslateParams = {}): string {
  return Object.entries(params).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), text)
}

/** English-only translator, used on the server and wherever no i18n is available. */
export const defaultMessages: MessageTranslator = (_key, fallback, params) => interpolate(fallback, params)

/** Random, prefixed id (`frm_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
