import { translate } from '../../utils'
import type { Translated } from '../../../types'
import { computed, useNuxtApp } from '#imports'

/** Locale for translated texts: `@nuxtjs/i18n`'s when installed, otherwise `en`. */
export function useCampaignsLocale() {
  const nuxtApp = useNuxtApp() as { $i18n?: { locale?: { value?: string } } }
  return computed(() => nuxtApp.$i18n?.locale?.value ?? 'en')
}

/** `tr(value)`: a translated text in the current locale, falling back to the default locale, then `en`, then any. */
export function useCampaignsTranslate() {
  const nuxtApp = useNuxtApp() as { $i18n?: { defaultLocale?: string } }
  const locale = useCampaignsLocale()
  return (value: Translated | null | undefined) => translate(value, locale.value, nuxtApp.$i18n?.defaultLocale ?? 'en')
}
