// Create a key first and put it in `playground/.env`:
//   NUXT_OAUTH_SERVER_PRIVATE_KEY="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | awk 'NF {printf "%s\\n", $0}')"
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/menu',
    '@frigear-nu/users',
    '@frigear-nu/oauth-server',
    // The playground's roles (`server/plugins/policy.ts` hands them out): `admin` gets `oauth:manage` (`grantTo`).
    // The same as `addRole` of `@frigear-nu/auth/utils`, which the playground does not depend on.
    (_options, nuxt) => {
      nuxt.hook('auth:role-definitions', (roles) => {
        roles.push({ name: 'admin', label: 'Admin', source: 'host' }, { name: 'member', label: 'Member', source: 'host' })
      })
    },
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  authentication: {
    settings: { pages: { login: '/sign-in', register: '/sign-up' } },
  },
  oauthServer: {
    settings: {
      pages: { admin: true, applications: true },
    },
  },
})
