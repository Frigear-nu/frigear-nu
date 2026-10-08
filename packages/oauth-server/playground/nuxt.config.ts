// Create a key first and put it in `playground/.env`:
//   NUXT_OAUTH_SERVER_PRIVATE_KEY="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | awk 'NF {printf "%s\\n", $0}')"
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/menu',
    '@frigear-nu/users',
    '@frigear-nu/oauth-server',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  oauthServer: {
    settings: {
      pages: { admin: true, applications: true },
    },
  },
  users: {
    mode: 'server',
    settings: {
      migrations: true,
      pages: { login: '/sign-in', register: '/sign-up' },
    },
  },
})
