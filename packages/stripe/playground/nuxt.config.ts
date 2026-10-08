export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/stripe',
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
  // NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (e.g. the `whsec_...` printed by `stripe listen`).
  users: {
    mode: 'server',
    settings: { migrations: true },
  },
})
