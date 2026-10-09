import type { Resolver } from '@nuxt/kit'

// Registered through `i18n:registerModule`: `@nuxtjs/i18n` merges every `files` entry per locale,
// so these shared strings (`common`, `actions`, `locale`) join the host's messages.
export const defaultI18nConfig = (
  resolver: Resolver,
) => {
  const langDir = resolver.resolve('./runtime/i18n/lang')
  return {
    langDir,
    locales: [
      { code: 'en', name: 'English', files: [resolver.resolve('./runtime/i18n/lang/en.json')] },
      { code: 'da', name: 'Dansk', files: [resolver.resolve('./runtime/i18n/lang/da.json')] },
    ],
  }
}
