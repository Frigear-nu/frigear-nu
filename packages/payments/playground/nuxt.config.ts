export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/users',
    '@frigear-nu/stripe',
    '@frigear-nu/payments',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
    kv: true,
  },
  // Provide real values through NUXT_STRIPE_SECRET_KEY, NUXT_STRIPE_WEBHOOK_SECRET and
  // NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
  users: {
    mode: 'server',
    settings: { migrations: true },
  },
})
