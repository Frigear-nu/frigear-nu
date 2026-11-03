// A Capacitor app on @frigear-nu/mobile: native tab bar on iOS, web chrome elsewhere, sign-in with @frigear-nu/auth in
// client mode and guards from @frigear-nu/authorization. Rename the app in `identity.ts`; point it at a server with `.env`.
// Module docs: https://docs.frigear.dev/modules/interface/mobile and https://docs.frigear.dev/modules/identity/auth/client-mode
import { appId, appName, callbackPath, clientId, scopes } from './identity'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@frigear-nu/mobile', '@frigear-nu/authorization'],

  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  // Guards of @frigear-nu/authorization. Signed in everywhere: /login and the callback stay public without a rule.
  // Remove it for a public home screen and guard single pages instead (`'/account': { authenticated: true }`). These
  // only decide what the app shows: the API decides what is allowed.
  routeRules: {
    '/**': { authenticated: true },
  },

  compatibilityDate: '2026-06-30',

  // @frigear-nu/auth, installed by mobile, which fills in the native redirect scheme (from appId). The mode is the
  // app's to set. The issuer and API come from NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER / _API_BASE in `.env`; they
  // are baked in at build time. `scopes` must include 'openid'.
  authentication: {
    mode: 'client',
    client: { clientId, scopes, callbackPath },
  },

  // @frigear-nu/authorization: guests go to the sign-in page, which sends them back afterwards.
  authorization: { redirectTo: '/login' },

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
      // Hidden while signed out.
      { id: 'account', to: '/account', label: 'Account', icon: 'i-lucide-circle-user-round', sfSymbol: 'person.crop.circle', sfSymbolActive: 'person.crop.circle.fill', requiresAuth: true },
    ],
  },
})
