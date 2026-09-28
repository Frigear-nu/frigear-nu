// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxthub/core',
    '@nuxt/content',
    '@nuxtjs/i18n',
    '@nuxtjs/device',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    'nuxt-qrcode',
    '@sentry/nuxt/module',
    '@norbiros/nuxt-auto-form',
  ],

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],
  // .content @ defaults
  $development: {
    content: {
      experimental: {
        sqliteConnector: 'native',
      },
    },
  },

  routeRules: {
    '/': { prerender: true },
  },

  compatibilityDate: '2026-06-30',

  // .nitro @ defaults
  nitro: {
    experimental: {
      tasks: true,
    },
  },

  // .hub @ defaults
  hub: {
    db: {
      dialect: 'sqlite',
      casing: 'snake_case',
    },
    kv: true,
  },

  $production: {
    hub: {
      db: {
        dialect: 'sqlite',
        driver: 'd1',
        connection: { databaseId: 'c0dbc11f-1a2d-4cf8-b520-9a150261a51a' },
        applyMigrationsDuringBuild: false,
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
})
