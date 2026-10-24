import {
  defineNuxtModule,
} from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'config',
  },
  setup(_options, nuxt) {
    // `useLocaleAlternates()` reads `useLocaleHead()`, which warns on every render without an i18n `baseUrl`.
    // Default it to `site.url`; `@nuxtjs/i18n` merges its own options under this value.
    const options = nuxt.options as typeof nuxt.options & { site?: { url?: string }, i18n?: { baseUrl?: unknown } }
    const siteUrl = options.site?.url
    const publicConfig = nuxt.options.runtimeConfig.public as Record<string, unknown>
    const i18n = (publicConfig.i18n ||= {}) as { baseUrl?: unknown }
    if (siteUrl && !options.i18n?.baseUrl && !i18n.baseUrl) {
      i18n.baseUrl = siteUrl
    }
  },
})
