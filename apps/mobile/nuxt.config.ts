// The Frigear app (iOS and Android): the user-facing parts of the website's modules in a Capacitor app on
// @frigear-nu/mobile, signed in at the website with @frigear-nu/auth in client mode. What the app has no page for opens on
// the website in the in-app browser (`mobile.host`). Rename the app in `identity.ts`; point it at a website with `.env`.
// Module docs: https://docs.frigear.dev/modules/interface/mobile and https://docs.frigear.dev/modules/identity/auth/client-mode
import { appId, appName, callbackPath, clientId, scopes } from './identity'

export default defineNuxtConfig({
  // Mobile first: the modules after it see a client-only app and leave out their server parts.
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/i18n',
    // Help answers and articles are Markdown with MDC blocks (`::faq-details{...}`); without it they show as plain text.
    '@nuxtjs/mdc',
    '@frigear-nu/mobile',
    '@frigear-nu/ui',
    // Before Account, which only adds its overview page with Menu.
    '@frigear-nu/menu',
    '@frigear-nu/authorization',
    '@frigear-nu/forms',
    '@frigear-nu/dashboard',
    '@frigear-nu/account',
    '@frigear-nu/crew',
    '@frigear-nu/shifts',
    '@frigear-nu/help-center',
  ],

  // Off: its floating button sits on the tab bar. Turn it on while you debug in a desktop browser.
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

  // Markdown only: no code blocks to highlight, so the highlighter stays out of the bundle.
  mdc: {
    highlight: false,
  },

  // Guards of @frigear-nu/authorization: signed in everywhere but the public home (and the sign-in callback, public
  // without a rule). They only decide what the app shows: the website's API decides what is allowed.
  routeRules: {
    '/**': { authenticated: true },
    '/': { authenticated: false },
    '/en': { authenticated: false },
  },

  compatibilityDate: '2026-06-30',

  // The Account tab: the overview and the profile. Security (passwords, passkeys, sessions) and API tokens need the
  // website's own session: they open there.
  account: {
    settings: { pages: { index: true, profile: true } },
  },

  // @frigear-nu/auth, installed by mobile, which fills in the native redirect scheme (from appId) and routes the
  // modules' `/api/` requests to the website. The issuer and API come from NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER /
  // _API_BASE in `.env`; they are baked in at build time. Signed out, the public home is the sign-in page.
  authentication: {
    mode: 'client',
    client: { clientId, scopes, callbackPath, redirect: { login: '/' } },
    settings: { pages: { login: false } },
  },

  // Guests on a guarded page go to the public home, which signs them in and sends them back (`?redirect=`).
  authorization: { redirectTo: '/' },

  // Home is a short "what's next": the next shift (nothing without one), then the upcoming events (modules/home-events.ts).
  // Every other crew, shifts, teams and operations item stays on the Crew tab's crew home.
  dashboard: {
    homeTab: { items: ['shifts.next'] },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  // As the website: Danish by default, English under /en.
  i18n: {
    strategy: 'prefix_except_default',
    detectBrowserLanguage: false,
    defaultLocale: 'da',
    locales: [
      { code: 'da', language: 'da-DK', name: 'Dansk', file: 'da.json' },
      { code: 'en', language: 'en-GB', name: 'English', file: 'en.json' },
    ],
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
    // Home (dashboard), Crew (crew and shifts), Wallet (Frigear ID, tickets and the scanner), Help (help center) and
    // Account. The modules add Home, Crew and Help; the orders put them in place. Shifts adds a tab of its own, left out
    // here: its pages open from the Crew tab.
    tabs: [
      { id: 'home', order: 0 },
      // A shift (`/shifts/:id`, opened from Home's next shift) belongs to the Crew tab.
      { id: 'crew', order: 1, match: ['/dashboard/crew', '/dashboard/crew/**', '/shifts/**'] },
      { id: 'shifts', enabled: false },
      { id: 'wallet', to: '/wallet', label: 'Wallet', labelKey: 'app.tabs.wallet', icon: 'i-lucide-wallet', sfSymbol: 'wallet.pass', sfSymbolActive: 'wallet.pass.fill', requiresAuth: true, order: 2 },
      { id: 'help-center', order: 3 },
      { id: 'account', to: '/account', label: 'Account', labelKey: 'app.tabs.account', icon: 'i-lucide-circle-user-round', sfSymbol: 'person.crop.circle', sfSymbolActive: 'person.crop.circle.fill', requiresAuth: true, order: 4 },
    ],
    // Pages the app has no page for (events, checkout, admin, sign-up, ...) open on the website (the issuer) in the
    // in-app browser, which shares the website session of the sign-in.
    host: true,
    // The splash screen is the app's own (components/Mobile/SplashScreen.vue: the full logo, as the native launch image
    // made from assets/splash*.png), up while the sign-in state is unknown (plugins/splash.client.ts).
    splashScreen: {
      background: { light: '#ffffff', dark: '#0a0a0a' },
    },
  },
})
