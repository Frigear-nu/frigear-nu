// A Capacitor app on @frigear-nu/mobile: native tab bar on iOS, web chrome elsewhere, sign-in with
// @frigear-nu/oauth-client. Rename the app in `identity.ts`; point it at a server with `.env`.
// Module docs: https://docs.frigear.dev/modules/mobile and https://docs.frigear.dev/modules/oauth-client
import { appId, appName, callbackPath, clientId, scopes } from './identity'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@frigear-nu/mobile'],

  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: true,
    },
  },

  // The app runs from the device, often offline: bundle the icons it uses instead of fetching them from the Iconify API.
  // `.ts` is scanned too, for the tab icons below and app.config.ts.
  icon: {
    clientBundle: {
      scan: { globInclude: ['**/*.{vue,ts}'] },
    },
  },

  // @frigear-nu/mobile: a static SPA (`nuxt generate`) that Capacitor serves from the device.
  mobile: {
    appId,
    appName,
    tabs: [
      { id: 'home', to: '/', label: 'Home', icon: 'i-lucide-house', sfSymbol: 'house', sfSymbolActive: 'house.fill' },
      { id: 'account', to: '/account', label: 'Account', icon: 'i-lucide-circle-user-round', sfSymbol: 'person.crop.circle', sfSymbolActive: 'person.crop.circle.fill' },
    ],
  },

  // @frigear-nu/oauth-client, installed by mobile: every page needs a signed-in user (except /login and the callback).
  // The issuer and API come from NUXT_PUBLIC_OAUTH_CLIENT_ISSUER / _API_BASE in `.env`; they are baked in at build time.
  oauthClient: {
    clientId,
    scopes,
    callbackPath,
  },
})
