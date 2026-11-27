import { ref, useNuxtApp } from '#imports'

type I18nLike = { t: (key: string) => string, te?: (key: string) => boolean, locale?: { value: string } }

/**
 * Bumped once `@nuxtjs/i18n` is ready and on every locale switch (`mobile` plugin). The shell's plugins run before
 * i18n's own, so a label computed at startup has no translations yet: reading this makes it compute again.
 */
const i18nVersion = ref(0)

/** Asks every translated tab label and title to compute again (i18n became ready, or the locale changed). */
export function refreshMobileTranslations() {
  i18nVersion.value++
}

/**
 * Translates a full i18n key (a tab's `labelKey`, a page's `titleKey`) when `@nuxtjs/i18n` has it, else `fallback`.
 * `$i18n` is looked up on every call, since it does not exist yet while the shell's plugins set up.
 */
export function useMobileTranslate() {
  const nuxtApp = useNuxtApp()
  return (key: string | undefined, fallback: string): string => {
    void i18nVersion.value
    const i18n = nuxtApp.$i18n as I18nLike | undefined
    void i18n?.locale?.value
    return key && i18n?.te?.(key) ? i18n.t(key) : fallback
  }
}
