// https://nuxt.com/docs/api/configuration/nuxt-config
import { createResolver } from '@nuxt/kit'

const resolver = createResolver(import.meta.url)
export default defineNuxtConfig({
  modules: [
    resolver.resolve('./modules/config'),
    resolver.resolve('./modules/routing'),
    '@nuxt/eslint',
    '@nuxt/icon',
    '@nuxt/image',
    '@comark/nuxt',
    '@nuxtjs/device',
    '@nuxt/hints',
    '@nuxt/fonts',
    '@nuxt/ui',
    '@nuxtjs/sitemap',
    '@nuxt/content',
    '@nuxtjs/i18n',
    (_, nuxt) => {
      if (!nuxt.options.css.find(css => css.includes('main.css'))) {
        nuxt.options.css.push(resolver.resolve('/app/assets/css/main.css'))
      }
    },
  ],

  content: {
    experimental: { sqliteConnector: 'native' },
    build: {
      markdown: {
        remarkPlugins: {},
        highlight: false,
      },
    },
  },

  // Server source-maps removed to half the required build time for production builds.
  // Source-maps are still generated for the client-side code.
  sourcemap: {
    server: false,
  },

  features: {
    inlineStyles: true,
  },
  experimental: {
    defaults: {
      nuxtLink: {
        prefetchOn: {
          interaction: true,
          visibility: false,
        },
      },
    },
  },

  compatibilityDate: '2026-07-30',

  vite: {
    build: {
      rolldownOptions: {
        checks: {
          // Building already spends the vast majority of its time inside
          // bundler plugin hooks (module resolution/transform work), so this
          // check just adds noisy, non-actionable warnings to every build.
          // See https://rolldown.rs/reference/InputOptions.checks#plugintimings
          pluginTimings: false,
        },
      },
    },
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'always-multiline',
        braceStyle: '1tbs',
      },
    },
  },

  i18n: {
    strategy: 'prefix_except_default',
    detectBrowserLanguage: false,
  },
})
