// A Tauri v2 desktop app on @frigear-nu/desktop that signs in at apps/web, in one of two modes (DESKTOP_MODE in `.env`):
//
// - remote (default): a static SPA in the window that signs in at apps/web with @frigear-nu/auth in client mode
//   (OAuth 2.1 + PKCE in the system browser) and calls its API with the access token.
// - local: the whole app with its own server (@frigear-nu/auth in server mode, @frigear-nu/users, sqlite), compiled
//   with Bun into a sidecar that runs offline on 127.0.0.1. People sign in at apps/web in the system browser (the
//   browser handoff) and keep a cookie session on the bundled server. The server code lives in the `local/` layer.
//
// apps/web registers both OAuth clients from `identity.ts`; rename the app there.
// Module docs: https://docs.frigear.dev/modules/interface/desktop
import { appId, appName, callbackPath, clientId, devPort, localClientId, scopes } from './identity'

const local = process.env.DESKTOP_MODE === 'local'

export default defineNuxtConfig({
  // Local mode only: the server routes (`local/server`), so the remote SPA does not type check code it never runs.
  extends: local ? ['./local'] : [],

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    ...(local ? ['@nuxthub/core', '@frigear-nu/users'] : []),
    '@frigear-nu/authorization',
    '@frigear-nu/desktop',
  ],

  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  // Guards of @frigear-nu/authorization. Signed in everywhere: the sign-in pages stay public without a rule. Remove it
  // for a public home page and guard single pages instead (`'/account': { authenticated: true }`). In remote mode these
  // only decide what the app shows: the API decides what is allowed.
  routeRules: {
    '/**': { authenticated: true },
  },

  // `pnpm dev`, and the window of `pnpm desktop:dev` (desktop.devUrl and Tauri's beforeDevCommand follow it).
  devServer: { port: devPort },

  compatibilityDate: '2026-06-30',

  // Local mode: sqlite. Under `nuxt dev` NuxtHub keeps it in .data/; the desktop build swaps the driver for bun:sqlite
  // in the user's app-data folder and applies `server/db/migrations` when the app starts.
  ...(local
    ? {
        hub: {
          db: { dialect: 'sqlite' as const, driver: 'libsql' as const, connection: { url: 'file:./.data/db/sqlite.db' } },
        },
      }
    : {}),

  // @frigear-nu/auth, installed by desktop. Remote: client mode at the issuer in NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER
  // (baked in at build time); desktop fills in the deep-link scheme from appId. Local: server mode (the default) whose
  // only sign-in is the issuer's (`oauth.frigear`, in the system browser: desktop turns the handoff on); accounts live in
  // apps/web, so there are no local passwords or registration. A first sign-in creates the local user.
  authentication: local
    ? {
        settings: {
          afterLogin: '/',
          password: false,
          oauth: { frigear: { label: `Sign in with your ${appName} account`, icon: 'i-lucide-log-in' } },
          pages: { login: true },
        },
      }
    : {
        mode: 'client',
        client: { clientId, scopes, callbackPath },
      },

  // Local mode: the issuer of the browser handoff (`frigear.sso`), a public client without a secret. Baked into the
  // build from `.env` (NUXT_FRIGEAR_SSO_URL, NUXT_FRIGEAR_SSO_CLIENT_ID), which also override them under `nuxt dev`.
  // The session cookie gets its own name: under `pnpm dev` apps/web's cookie lives on the same `localhost`.
  ...(local
    ? {
        runtimeConfig: {
          frigear: {
            sso: {
              url: process.env.NUXT_FRIGEAR_SSO_URL || 'http://localhost:3000',
              clientId: process.env.NUXT_FRIGEAR_SSO_CLIENT_ID || localClientId,
            },
          },
          session: { name: 'desktop-session' },
        },
      }
    : {}),

  // @frigear-nu/authorization: guests go to the sign-in page, which sends them back afterwards.
  authorization: { redirectTo: '/login' },

  // @frigear-nu/desktop: the Tauri settings `pnpm desktop:sync` merges into src-tauri/.
  desktop: {
    appId,
    appName,
    mode: local ? 'local' : 'remote',
    window: { width: 1100, height: 760, minWidth: 720, minHeight: 520 },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  // The app runs from the user's machine, often offline: bundle the icons it uses instead of fetching them from the
  // Iconify API. `.ts` is scanned too, for app.config.ts.
  icon: {
    clientBundle: {
      scan: { globInclude: ['**/*.{vue,ts}'] },
    },
  },
})
