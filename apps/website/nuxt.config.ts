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
    '@norbiros/nuxt-auto-form',
    '@frigear-nu/menus',
    '@frigear-nu/users',
    '@frigear-nu/account',
    '@frigear-nu/notify',
  ],

  $development: {
    content: {
      experimental: {
        sqliteConnector: 'native',
      },
    },
    nitro: {
      scheduledTasks: {
        '*/1 * * * *': ['test'],
      },
    },
  },

  $production: {
    hub: {
      db: {
        dialect: 'sqlite',
        driver: 'd1',
        connection: {
          // Overridden per-deployment by the deploy workflows: the production
          // worker keeps the hardcoded default, while PR previews point at
          // their own per-PR D1 database (see apps/website/.github/workflows/deploy.yml).
          databaseId: process.env.NUXT_HUB_CLOUDFLARE_DATABASE_ID || 'c0dbc11f-1a2d-4cf8-b520-9a150261a51a',
        },
        applyMigrationsDuringBuild: false,
      },
    },
  },

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
    // Lets the deploy workflows pin the worker name (e.g. to keep PR preview
    // versions on the same worker as production) without hardcoding it here.
    name: process.env.CLOUDFLARE_WORKER_NAME || undefined,
    db: {
      dialect: 'sqlite',
      casing: 'snake_case',
      driver: 'libsql',
      connection: { url: 'file:./.data/db/sqlite.db' },
    },
  },
  account: {
    settings: {
      pages: { index: true, profile: true, security: true },
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
    defaultLocale: 'da',
    locales: [
      { code: 'da', name: 'Danish' },
      { code: 'en', name: 'English' },
    ],
  },
  notify: {
    email: {
      driver: 'log',
    },
    ui: {
      driver: '@nuxt/ui',
    },
  },
  users: {
    mode: 'server',
    settings: {
      pages: { login: '/sign-in', register: '/sign-up' },
      password: true,
      migrations: true,
      webAuthn: true,
    },
  },
})
