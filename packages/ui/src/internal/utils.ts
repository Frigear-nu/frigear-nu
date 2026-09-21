import type { Resolver } from '@nuxt/kit'

export const defaultI18nConfig = (
  resolver: Resolver,
) => {
  return {
    vueI18n: resolver.resolve('./runtime/i18n/vue-i18n.config.ts'),
    langDir: resolver.resolve('./runtime/i18n/lang'),
    locales: [
      { code: 'en', name: 'English', file: resolver.resolve('./runtime/i18n/lang/en.json') },
      { code: 'da', name: 'Dansk', file: resolver.resolve('./runtime/i18n/lang/da.json') },
    ],
  }
}
