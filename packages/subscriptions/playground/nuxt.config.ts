export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/menu',
    '@frigear-nu/users',
    '@frigear-nu/stripe',
    '@frigear-nu/subscriptions',
  ],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
    kv: true,
  },
  // Provide real values through NUXT_STRIPE_SECRET_KEY, NUXT_STRIPE_WEBHOOK_SECRET and
  // NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, and point the plans at your own Stripe prices.
  subscriptions: {
    plans: {
      member: { label: 'Member', rank: 1, prices: [{ lookupKey: 'member_monthly' }, { lookupKey: 'member_yearly' }] },
      patron: { label: 'Patron', rank: 2, prices: [{ lookupKey: 'patron_yearly' }] },
    },
    settings: {
      pages: { membership: true, success: true, cancel: true },
    },
  },
  users: {
    mode: 'server',
    settings: { migrations: true },
  },
})
