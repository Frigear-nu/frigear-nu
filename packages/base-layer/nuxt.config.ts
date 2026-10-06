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
    '@frigear-nu/menu',
    (_, nuxt) => {
      if (!nuxt.options.css.find(css => css.includes('main.css'))) {
        nuxt.options.css.push(resolver.resolve('./app/assets/css/main.css'))
      }
    },
  ],
  $meta: {
    name: 'base',
  },

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
    plugins: [
      {
        // Nuxt 4.6's `installedScanEntries` (in `@nuxt/vite-builder`) feeds every
        // node_modules-installed component/plugin/layout/middleware file to Vite's
        // dependency scanner as a scan entry, so it can pre-bundle their deps. Nuxt's
        // own virtual-module resolvers (`#components`, `#imports`, `#app`, `#build/*`,
        // ...) skip resolution during that scan, so the request falls through to
        // Vite/rolldown's default resolver, which tries to resolve the `#`-prefixed
        // specifier as a Node.js subpath import relative to the *importing package*
        // (e.g. `@nuxtjs/i18n`) instead of the Nuxt app root - and fails, since that
        // package never declares the specifier in its own `imports` field. This aborts
        // the whole scan with "Missing '#x' specifier in '<package>' package" and Vite
        // falls back to skipping dependency pre-bundling entirely.
        // Fix pending upstream: https://github.com/nuxt/nuxt/issues/36473
        name: 'frigear-nu:scan-external-virtual-specifiers',
        enforce: 'pre',
        resolveId: {
          filter: { id: /^#/ },
          handler(id, _importer, options) {
            // `scan` is passed at runtime by Vite/rolldown's dependency scanner
            // but isn't part of the public `resolveId` hook option types.
            if ((options as { scan?: boolean } | undefined)?.scan) {
              return { id, external: true }
            }
          },
        },
      },
    ],
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
  menus: {
    content: {
      main: true,
    },
  },
})
