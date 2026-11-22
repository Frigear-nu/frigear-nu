export type TranslateParams = Record<string, string | number>

/** `(key, englishFallback, params) => text`, the shape of `useModuleT('forms')`. */
export type MessageTranslator = (key: string, fallback: string, params?: TranslateParams) => string

/** Replaces `{name}` placeholders. */
export function interpolate(text: string, params: TranslateParams = {}): string {
  return Object.entries(params).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), text)
}

/** English-only translator, used on the server and wherever no i18n is available. */
export const defaultMessages: MessageTranslator = (_key, fallback, params) => interpolate(fallback, params)

/** Random, prefixed id (`<prefix>_<32 hex>`): the one of `@frigear-nu/module-kit/id`. */
export { newId } from '@frigear-nu/module-kit/id'
