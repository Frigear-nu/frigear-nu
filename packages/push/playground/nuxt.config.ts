export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/users',
    '@frigear-nu/push',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  // Without credentials `sendPush` only logs. Provide real values through NUXT_PUSH_FCM_SERVICE_ACCOUNT and
  // NUXT_PUSH_APNS_KEY_ID, NUXT_PUSH_APNS_TEAM_ID, NUXT_PUSH_APNS_TOPIC and NUXT_PUSH_APNS_PRIVATE_KEY.
})
