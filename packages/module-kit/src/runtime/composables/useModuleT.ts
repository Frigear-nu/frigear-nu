type Params = Record<string, string | number>

/**
 * Optional-i18n translator for module UI.
 *
 * Resolves `<namespace>.<key>` through `@nuxtjs/i18n` when the host has it and the key exists,
 * otherwise returns the English `fallback` (with `{param}` placeholders replaced). Modules can
 * therefore ship hardcoded English defaults and still be translated by the host app.
 */
export const useModuleT = (namespace: string) => {
  const i18n = useNuxtApp().$i18n as
    | { t: (key: string, params?: Params) => string, te?: (key: string) => boolean }
    | undefined

  return (key: string, fallback: string, params: Params = {}): string => {
    const path = `${namespace}.${key}`
    if (i18n?.te?.(path)) {
      return i18n.t(path, params)
    }
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      fallback,
    )
  }
}
