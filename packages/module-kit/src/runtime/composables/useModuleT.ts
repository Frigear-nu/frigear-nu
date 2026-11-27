import { useNuxtApp } from '#imports'

type Params = Record<string, string | number>

export interface ModuleTOptions {
  /** Translate into this locale instead of the page's. Its messages must be loaded (`loadLocaleMessages`). */
  locale?: string
}

/**
 * Optional-i18n translator for module UI.
 *
 * Resolves `<namespace>.<key>` through `@nuxtjs/i18n` when the host has it and the key exists,
 * otherwise returns the English `fallback` (with `{param}` placeholders replaced). Modules can
 * therefore ship hardcoded English defaults and still be translated by the host app. With
 * `locale`, text is resolved in that locale rather than the page's.
 */
export const useModuleT = (namespace: string, options: ModuleTOptions = {}) => {
  const i18n = useNuxtApp().$i18n as
    | {
      t: (key: string, params?: Params, options?: { locale?: string }) => string
      te?: (key: string, locale?: string) => boolean
    }
    | undefined
  const { locale } = options

  return (key: string, fallback: string, params: Params = {}): string => {
    const path = `${namespace}.${key}`
    if (i18n?.te?.(path, locale)) {
      return locale ? i18n.t(path, params, { locale }) : i18n.t(path, params)
    }
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      fallback,
    )
  }
}
