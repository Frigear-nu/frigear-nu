// A Nuxt 4 app on the @frigear-nu modules: register/login, /account and /admin with user management.
// Every module option is documented in https://github.com/Frigear-nu/frigear-nu/tree/main/apps/docs/content/5.modules
export default defineNuxtConfig({
  // Order matters only for readability: each module installs the ones it depends on (auth, notify, ui, ...).
  modules: [
    '@nuxt/eslint',
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/menu',
    '@frigear-nu/widget',
    '@frigear-nu/users',
    '@frigear-nu/authorization',
    '@frigear-nu/account',
    '@frigear-nu/admin',
  ],

  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // NUXT_ACL_ADMINS: comma separated emails that are always admins (see server/utils/acl.ts).
    aclAdmins: '',
  },

  compatibilityDate: '2026-06-30',

  // Local sqlite in .data/; NuxtHub applies server/db/migrations on `nuxt dev` and `nuxt build`.
  // For production, point `connection` at your database (Turso, D1, Postgres): https://hub.nuxt.com/docs/database
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      connection: { url: 'file:./.data/db/sqlite.db' },
    },
  },

  // @frigear-nu/account: the /account pages.
  account: {
    settings: {
      pages: { index: true, profile: true, security: true, apiTokens: true },
    },
  },

  // @frigear-nu/admin: the /admin area, open to these roles.
  admin: {
    settings: {
      roles: ['admin'],
    },
  },

  // @frigear-nu/auth: sign-in. Email/password is on by default.
  authentication: {
    settings: {
      afterLogin: '/account',
      pages: { login: true, register: true },
      session: { mapper: '~~/server/utils/map-session-user' },
    },
  },

  // @frigear-nu/authorization: guests on a guarded page (/account/**, /admin/**) go to the login page.
  authorization: {
    redirectTo: '/login',
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  // @frigear-nu/notify: emails (password reset, ...) are printed to the terminal until you configure a driver.
  notify: {
    email: { driver: 'log' },
  },

  // @frigear-nu/users: /admin/users; who may do what is decided in server/plugins/users-policy.ts.
  users: {
    settings: {
      admin: true,
      profilePath: '/account/profile',
    },
  },
})
