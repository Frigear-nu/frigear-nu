import { useNuxtApp } from '#imports'

type I18nLike = { t: (key: string) => string, te?: (key: string) => boolean }

/** Translates a full i18n key (a tab's `labelKey`, a page's `titleKey`) when `@nuxtjs/i18n` has it, else `fallback`. */
export function useMobileTranslate() {
  const i18n = useNuxtApp().$i18n as I18nLike | undefined
  return (key: string | undefined, fallback: string): string => (key && i18n?.te?.(key) ? i18n.t(key) : fallback)
}
