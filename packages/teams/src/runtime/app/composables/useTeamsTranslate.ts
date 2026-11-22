import { translate } from '../../utils'
import type { Translated } from '../../../types'
import { computed, useNuxtApp } from '#imports'

/** Locale for translated texts: `@nuxtjs/i18n`'s when installed, otherwise `en`. */
export function useTeamsLocale() {
  const nuxtApp = useNuxtApp() as { $i18n?: { locale?: { value?: string } } }
  return computed(() => nuxtApp.$i18n?.locale?.value ?? 'en')
}

/** The site's default locale: shown for texts that have no translation in the current locale. */
export function useTeamsFallbackLocale() {
  const nuxtApp = useNuxtApp() as { $i18n?: { defaultLocale?: string } }
  return computed(() => nuxtApp.$i18n?.defaultLocale ?? 'en')
}

/** `tr(value)`: a translated text in the current locale, falling back to the default locale, then `en`, then any. */
export function useTeamsTranslate() {
  const locale = useTeamsLocale()
  const fallback = useTeamsFallbackLocale()
  return (value: Translated | null | undefined) => translate(value, locale.value, fallback.value)
}
