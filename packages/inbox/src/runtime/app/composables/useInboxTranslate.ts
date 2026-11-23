import { translate } from '@frigear-nu/ui/translated'
import type { Translated } from '@frigear-nu/ui/translated'
import { useTranslatedFallbackLocale, useTranslatedLocale } from '#imports'

/** `tr(value)`: a translated text in the current locale, falling back to the default locale, then `en`, then any. */
export function useInboxTranslate() {
  const locale = useTranslatedLocale()
  const fallback = useTranslatedFallbackLocale()
  return (value: Translated | null | undefined) => translate(value, locale.value, fallback.value)
}
