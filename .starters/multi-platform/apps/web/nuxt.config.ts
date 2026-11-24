// A Nuxt 4 app on the @frigear-nu modules: register/login, /account and /admin with user management, and the OAuth
// server and API that apps/mobile and apps/desktop sign in at and call.
// Every module option is documented in https://docs.frigear.dev/modules
import * as desktop from '@workspace/desktop/identity'
import { appName, clientId, devRedirectUri, nativeRedirectUri } from '@workspace/mobile/identity'

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
    '@frigear-nu/oauth-server',
  ],

  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // NUXT_ACL_ADMINS: comma separated emails that are always admins (see server/plugins/authorization-roles.ts).
    aclAdmins: '',
    public: {
      // NUXT_PUBLIC_SITE_URL: the public URL of the site. Emailed links (password reset, sign-in, verification) point
      // here; in production they fail until it is set.
      siteUrl: '',
    },
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

  // @frigear-nu/auth: sign-in with email/password (on by default) and passkeys, which users add on
  // /account/security. Passkeys are bound to the domain the site runs on: choose the production domain before launch.
  // `verifyEmail`: a new account signs in through the emailed link, which proves the address (NUXT_ACL_ADMINS counts
  // only for verified addresses).
  authentication: {
    settings: {
      webAuthn: true,
      verifyEmail: true,
      afterLogin: '/account',
      pages: { login: true, register: true },
    },
  },

  // @frigear-nu/authorization: guests on a guarded page (/account/**, /admin/**) go to the login page. A role is a
  // bundle of permissions; `server/plugins/authorization-roles.ts` makes verified NUXT_ACL_ADMINS addresses admins.
  authorization: {
    redirectTo: '/login',
    defaultRoles: ['user'],
    roles: {
      admin: { label: 'Admin', grant: ['*'] },
      user: { label: 'User' },
    },
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

  // @frigear-nu/oauth-server: apps/mobile and apps/desktop sign in here (PKCE, no secret) and call /api/** with the
  // access token (apps/desktop in local mode signs its own server in instead, see its client below).
  // Signing key: NUXT_OAUTH_SERVER_PRIVATE_KEY (`pnpm prepare:env` generates one). /admin/oauth is for roles
  // holding `oauth:manage` (admins). A client's `allowedRoles` is checked against the user's roles (`authorization.roles`).
  oauthServer: {
    cors: {
      // The webviews of the mobile app, iOS (capacitor://localhost) and Android (https://localhost), and of the desktop
      // app in remote mode, macOS and Linux (tauri://localhost) and Windows (http://tauri.localhost).
      origins: ['capacitor://localhost', 'https://localhost', ...desktop.webviewOrigins],
      // Your API: the same origins may call it with `Authorization: Bearer`.
      paths: ['/api/'],
    },
    // The mobile app, with a fixed client_id from apps/mobile/identity.ts. Its dev server's origin is allowed for
    // CORS under `nuxt dev` only, with its dev redirect URI.
    clients: [{
      id: clientId,
      name: appName,
      redirectUris: [nativeRedirectUri],
      devRedirectUris: [devRedirectUri],
    }, {
      // The desktop app in remote mode, from apps/desktop/identity.ts: its deep link, and its dev server under `nuxt dev`.
      id: desktop.clientId,
      name: `${desktop.appName} (desktop)`,
      redirectUris: [desktop.nativeRedirectUri],
      devRedirectUris: [desktop.devRedirectUri],
    }, {
      // The desktop app in local mode: its bundled server signs in through the browser handoff, on a loopback port
      // picked at every start (registered without a port, RFC 8252). The window only calls its own server: no CORS.
      id: desktop.localClientId,
      name: `${desktop.appName} (desktop, local mode)`,
      redirectUris: [desktop.loopbackRedirectUri],
      devRedirectUris: [desktop.localDevRedirectUri],
      corsOrigins: false,
    }],
    settings: {
      // /admin/oauth: the applications, the mobile and desktop apps among them as "Managed in nuxt.config".
      pages: { admin: true },
    },
  },

  // @frigear-nu/users: /admin/users; who may do what is decided by the roles' permissions (`authorization.roles`).
  users: {
    settings: {
      admin: true,
      profilePath: '/account/profile',
      // A new email address takes effect once its owner confirms it from the emailed link.
      verifyEmailChange: true,
    },
  },
})
