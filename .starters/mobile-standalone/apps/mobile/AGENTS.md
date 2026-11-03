# AGENTS.md - `apps/mobile`

A **Capacitor** app: a static Nuxt 4 SPA (`ssr: false`, `nuxt generate` → `.output/public`) on the published
`@frigear-nu/mobile` and `@frigear-nu/oauth-client` modules, wrapped in native iOS and Android projects. Run every
command from the repository root (`pnpm --filter ./apps/mobile <command>`, or the root `mobile:*` scripts), never from
this folder. Docs: https://docs.frigear.dev/modules/interface/mobile and https://docs.frigear.dev/modules/oauth-client, also as
Markdown at `https://docs.frigear.dev/raw/<path>.md`.

## Layout

```
identity.ts               app id, app name, OAuth client id, callback path, dev port, scopes: rename the app here
nuxt.config.ts            modules, tabs (`mobile.tabs`) and sign-in (`oauthClient`), read from identity.ts
.env.example              NUXT_PUBLIC_OAUTH_CLIENT_* : the issuer and API the app talks to
app/app.vue               <UApp :toaster="useMobileToaster()">
app/app.config.ts         branding of the /login page
app/pages/index.vue       Home tab: the ID token claims and a sample call to /api/me
app/pages/account.vue     Account tab: the profile and sign-out
ios/, android/            native projects, created by `pnpm mobile:native` (not in the starter)
```

- `identity.ts` is exported as `@workspace/mobile/identity`, so a server in this workspace (the standalone starter's
  `apps/web`) registers the OAuth client from the same values. Keep it plain constants: Node loads it with the config.
- `mobile` installs `oauthClient` with `protect: 'all'`: every page needs a signed-in user except `/login` and
  `/auth/callback`. `definePageMeta({ oauth: false })` makes a page public.
- Call your API with `useApi(url)` or `useNuxtApp().$api(url)`: they add the bearer token, refresh it on `401` and only
  send it to the issuer and `apiBase` origins. Never read tokens yourself.
- `NUXT_PUBLIC_*` values are baked in by `nuxt generate`: rebuild (`pnpm mobile:sync`) after changing `.env`.
- Tabs: `mobile.tabs` in `nuxt.config.ts` (`icon` for the web tab bar, `sfSymbol` for the native iOS one). Page titles
  and options: `definePageMeta({ mobile: { title, tabBar, back } })`. At most five tabs.
- Nuxt 4 directory structure; `<script setup lang="ts">`; Nuxt UI 4 components. Icons are bundled (`icon.clientBundle`)
  because the app often runs offline: keep using `i-lucide-*` names in `.vue` and `.ts` files so the scan finds them.

## Native projects

- `pnpm mobile:native` runs `cap add ios` / `cap add android` and registers the URL scheme (the app id in lowercase) for
  the OAuth redirect and deep links. It is idempotent; the `ios:*` / `android:*` scripts run it with `--if-missing`.
- `pnpm mobile:doctor` lists missing Capacitor plugins. Capacitor only links the native code of this app's own
  dependencies, so plugins go in `apps/mobile/package.json`, not in a package it depends on.
- `ios/` and `android/` are generated. Commit them once you change native settings (signing team, icons, entitlements),
  and run `pnpm mobile:sync` after every web change and every install (Swift Package Manager paths point into
  `node_modules`).
- After changing `appId`, delete `ios/` and `android/` and run `pnpm mobile:native` again.
- iOS needs Xcode; Android needs Android Studio (a JDK and the Android SDK).

## Before finishing

From the repository root: `pnpm lint`, `pnpm typecheck`, `pnpm build`. Never commit `.nuxt/`, `.output/`, `.env` or
`capacitor.config.json` (written by `nuxt-capacitor` from `nuxt.config.ts`).
