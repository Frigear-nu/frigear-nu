# AGENTS.md - `apps/mobile`

The **Frigear app** (iOS and Android): a static Nuxt 4 SPA (`ssr: false`, `nuxt generate` → `.output/public`) on
`@frigear-nu/mobile`, wrapped in native projects by Capacitor. It runs the website's feature modules (Dashboard, Crew,
Shifts, Help Center, Account) client only: their `/api/` calls go to the website with the access token
(`authentication.client.routeApi`), and what the app has no page for opens on the website in the in-app browser
(`mobile.host`). Users sign in at the website with `@frigear-nu/auth` in client mode (OAuth client `mobile`, registered
in `apps/website/nuxt.config.ts`). Run every command from the repository root (`pnpm --filter ./apps/mobile <command>`,
or the root `mobile:*` scripts), never from this folder. Docs: `apps/docs/content/3.modules/7.interface/5.mobile/`.

## Layout

```
identity.ts                     app id (nu.frigear.app), name, OAuth client id, callback path, dev port, scopes
nuxt.config.ts                  modules, tabs (`mobile.tabs`), host, splash, sign-in and guards (`routeRules`)
.env.example                    the website the app signs in at and calls (issuer and API base)
app/pages/index.vue             signed out: public home (events, contact form, sign in, create account); signed in: Home tab
app/components/home/            the public home's sections
app/components/Mobile/SplashScreen.vue   the splash screen (full logo)
app/components/AccountSignOut.vue        sign-out on the Account overview (modules/account-sign-out.ts adds it)
app/plugins/splash.client.ts    holds the splash screen while the sign-in state is unknown
i18n/locales/{da,en}.json       the app's own strings (Danish default, English under /en, as the website)
assets/                         icon and splash sources; `pnpm mobile:assets` writes the native icons and splash
ios/, android/                  native projects (`pnpm mobile:native`), committed
```

- Tabs: Home (`@frigear-nu/dashboard`), Crew (`@frigear-nu/crew`), Help (`@frigear-nu/help-center`) and Account (this
  app). Shifts' own tab is left out (`{ id: 'shifts', enabled: false }`); its pages open from Home and Crew.
- Guards: `'/**': { authenticated: true }` with `/` public. Guests go to `/` (`authorization.redirectTo`), which signs
  them in and sends them back. Guards only decide what the app shows: the website's API decides what is allowed.
- Scopes: the access token carries only the permissions of its scopes, so `identity.ts` asks for what the tabs use. A
  module page that gets `403` from the API usually needs one more scope there.
- `NUXT_PUBLIC_*` values are baked in by `nuxt generate`: rebuild (`pnpm mobile:sync`) after changing `.env`. Release
  builds point at `https://frigear-nu.frigear.workers.dev` and use the client id of the app registered on that website
  (`NUXT_PUBLIC_AUTHENTICATION_CLIENT_CLIENT_ID`), set in the release environment. Never commit that id or a real
  `.env`; `identity.ts` keeps `mobile`, the website's configured client for development.
- For a phone build against production, create `apps/mobile/.env.production` (gitignored by `.env.*`) with the release
  issuer, API base and the production client id, then run `pnpm mobile:ios:prod` (`nuxt generate --dotenv
  .env.production`, `cap sync ios`, opens Xcode):

  ```
  NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER=https://frigear-nu.frigear.workers.dev
  NUXT_PUBLIC_AUTHENTICATION_CLIENT_API_BASE=https://frigear-nu.frigear.workers.dev
  NUXT_PUBLIC_AUTHENTICATION_CLIENT_CLIENT_ID=<the production app's client id>
  ```

  Run `pnpm mobile:sync` (or `mobile:ios`) afterwards to go back to the development build.
- Home (`dashboard.homeTab.items`) shows only the next shift and the upcoming events (`modules/home-events.ts`, in the
  `dashboard.home` widget area); everything else about crew and shifts is on the Crew tab.
- Capacitor only links the native code of this app's own dependencies: plugins go in `apps/mobile/package.json`.
  `pnpm mobile:doctor` lists missing ones.
- Run `pnpm mobile:sync` after every web change and every install (Swift Package Manager paths point into
  `node_modules`). After changing `appId`, delete `ios/` and `android/` and run `pnpm mobile:native` and
  `pnpm mobile:assets` again.

## Before finishing

From the repository root: `pnpm --filter ./apps/mobile lint`, `pnpm --filter ./apps/mobile typecheck`,
`pnpm --filter ./apps/mobile build`. Never commit `.nuxt/`, `.output/`, `.env` or `capacitor.config.json`.
