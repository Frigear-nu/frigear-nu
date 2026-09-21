// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    "@nuxt/eslint",
    "@nuxt/ui",
    "@nuxthub/core",
    "@nuxt/content",
    "@nuxtjs/i18n",
    "@nuxtjs/device",
    "@pinia/nuxt",
    "@pinia/colada-nuxt",
    "nuxt-qrcode",
    "@sentry/nuxt/module",
    "@norbiros/nuxt-auto-form",
  ],

  devtools: {
    enabled: true,
  },

  css: ["~/assets/css/main.css"],

  routeRules: {
    "/": { prerender: true },
  },

  compatibilityDate: "2026-06-30",

  // .nitro @ defaults
  nitro: {
    experimental: {
      tasks: true,
    },
  },

  // .hub @ defaults
  hub: {
    db: {
      dialect: "sqlite",
      casing: "snake_case",
    },
    kv: true,
  },
  // .content @ defaults
  content: {
    experimental: {
      sqliteConnector: "native",
    },
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: "always-multiline",
        braceStyle: "1tbs",
      },
    },
  },
});
