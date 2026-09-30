// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ['@frigear-nu/base'],
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
    '@frigear-nu/module-kit',
    '@frigear-nu/users',
  ],

  $development: {
    content: {
      experimental: {
        sqliteConnector: 'native',
      },
    },
  },

  // $production: {
  //   hub: {
  //     db: {
  //       dialect: 'sqlite',
  //       driver: 'd1',
  //       connection: { databaseId: 'c0dbc11f-1a2d-4cf8-b520-9a150261a51a' },
  //       applyMigrationsDuringBuild: false,
  //     },
  //   },
  // },

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],

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
      driver: 'libsql',
      connection: { url: 'file:./db.sqlite' },
    },
    kv: true,
  },
  eslint: {
    config: {
      stylistic: {
        commaDangle: 'always-multiline',
        braceStyle: '1tbs',
      },
    },
  },
  users: {
    mode: 'server',
    settings: {
      pages: true,
      password: true,
      migrations: true,
    },
  },
})
