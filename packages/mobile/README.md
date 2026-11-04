# @frigear-nu/mobile

A Capacitor app shell for Nuxt. It turns a Nuxt app into an iOS / Android app with one config block:

- **one tab registry** (`mobile.tabs` + `extendMobileTabs()` from other modules) feeding the native iOS tab bar
  (`@capgo/capacitor-native-navigation`), the web tab bar and the page titles
- the native navbar and tab bar on iOS, a web header and tab bar in a browser and on Android, the same
  `--mobile-inset-*` CSS variables for both
- page titles from `definePageMeta({ mobile: { title } })`, else the selected tab, else the app name
- safe areas, an iOS type scale, `:active` states on iOS, no tap highlight, switch haptics, the keyboard accessory bar
  and a status bar that follows the colour mode
- `useNative()`: haptics, action sheets, confirms and sharing with web fallbacks
- deep links (custom schemes, universal links) routed into the app, the Android back button
- sign-in through [`@frigear-nu/auth`](../auth) in client mode (installed for you when `authentication` is configured);
  the app picks its guards with [`@frigear-nu/authorization`](../authorization): nothing is protected by default
- the `frigear-mobile` CLI: adds the iOS / Android projects and registers the URL schemes in them; `doctor` checks them

It builds on [`nuxt-capacitor`](https://github.com/hareland/nuxt-capacitor), which writes `capacitor.config.json` from
your Nuxt config.

## Setup

```bash
pnpm add @frigear-nu/mobile @nuxt/ui @capacitor/core @capacitor/app @capacitor/ios
pnpm add -D @capacitor/cli
# optional, for the features that use them:
pnpm add @capgo/capacitor-native-navigation @capacitor/haptics @capacitor/action-sheet @capacitor/dialog \
  @capacitor/share @capacitor/status-bar @capacitor/keyboard
# with sign-in:
pnpm add @capacitor/browser @aparajita/capacitor-secure-storage
```

Capacitor only links the native code of plugins that are **dependencies of the app**, so install the plugins in the
app, not only in a package it depends on. `frigear-mobile doctor` lists the missing ones.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/mobile'],
  css: ['~/assets/css/main.css'],
  mobile: {
    appId: 'nu.frigear.bills', // capacitor appId, and (lowercase) the OAuth redirect scheme
    appName: 'Bills',
    tabs: [
      { id: 'home', to: '/', label: 'Upcoming', icon: 'i-lucide-calendar-clock', sfSymbol: 'calendar.badge.clock' },
      { id: 'bills', to: '/bills', label: 'Bills', icon: 'i-lucide-receipt-text', sfSymbol: 'list.bullet.rectangle' },
      { id: 'account', to: '/account', label: 'Account', icon: 'i-lucide-circle-user-round', sfSymbol: 'person.crop.circle', requiresAuth: true },
    ],
  },
  // Optional: sign in. Mobile installs @frigear-nu/auth and fills in `client.native.scheme` (from appId); the mode is
  // the app's to set.
  authentication: {
    mode: 'client',
    client: { issuer: 'https://frigear.nu', clientId: 'bills', scopes: ['openid', 'profile', 'offline_access'] },
  },
  // Guards are the app's: add `@frigear-nu/authorization` to `modules`, then for example signed in everywhere
  // (the login and callback pages stay open):
  routeRules: { '/**': { authenticated: true } },
})
```

```vue
<!-- app.vue -->
<template>
  <UApp :toaster="useMobileToaster()">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

Then build and open the app:

```bash
nuxt generate                     # the static SPA in .output/public
npx frigear-mobile native         # npx cap add ios / android + URL schemes in Info.plist / AndroidManifest.xml
npx cap sync && npx cap run ios
```

Suggested scripts: `"ios:run": "frigear-mobile native --if-missing && nuxt generate && cap sync ios && cap run ios"`.

## Options (`mobile`)

| Option | Default | |
|---|---|---|
| `appId` | `capacitor.config.appId` | reverse-DNS id; `capacitor.config.appId`, and the OAuth redirect scheme (lowercase, `_` as `-`) |
| `appName` | `capacitor.config.appName`, else `appId` | `capacitor.config.appName` and the fallback title |
| `tabs` | `[]` | see [Tabs](#tabs) |
| `auth` | on when `@frigear-nu/auth` runs in client mode | tabs with `requiresAuth` show signed in only |
| `spa` | `true` | `ssr: false`: Capacitor serves a static build |
| `layout` | `'mobile'` | the shell layout's name (also `default` when the app has none); `false` for none. An app layout of that name wins |
| `nativeChrome` | `'ios'` | native navbar and tab bar on `ios`, on `all` platforms, or `false`; needs `@capgo/capacitor-native-navigation` |
| `native.statusBar` | `true` | status bar text follows the colour mode |
| `native.keyboardAccessoryBar` | `true` | iOS: the Done bar above the keyboard |
| `native.switchHaptics` | `true` | a tick when a `role="switch"` is tapped |
| `native.backButton` | `true` | Android back button: close overlay → back → first tab → minimize |
| `appearance.iosTypeScale` | `true` | iOS text sizes (17pt body) |
| `appearance.tapHighlight` | `true` | no grey tap flash |
| `appearance.toasterOffset` | `true` | `useMobileToaster()` puts toasts at the top, below the navbar |
| `deepLinks.schemes` | `[appId]` | custom schemes routed into the app; `false` for none |
| `deepLinks.hosts` | `[]` | `https` hosts of universal links / app links |
| `dev.lanHost` | `true` | for `MOBILE_LAN` builds, see [Device development](#device-development) |
| `ios.allowLocalNetworking` | `true` | `NSAllowsLocalNetworking` in Info.plist (plain http to the LAN) |
| `doctor` | `true` | warnings on dev / build start |

`mobile` sets these `nuxt-capacitor` defaults (yours win): `capacitor.autoSync: false`, `capacitor.config.appId` /
`appName`, and the Keyboard plugin's `resize: 'native'`.

## Tabs

```ts
interface MobileTabDefinition {
  id: string            // native tab id
  to: string            // the tab's page
  label: string
  labelKey?: string     // i18n key
  title?: string        // navbar title, default: label
  titleKey?: string
  icon: string          // Nuxt UI icon of the web tab bar
  activeIcon?: string
  sfSymbol?: string     // native iOS tab
  sfSymbolActive?: string
  androidIcon?: string  // drawable, with nativeChrome: 'all'
  requiresAuth?: boolean // default: false (hidden while signed out when true)
  match?: string | string[] // default: to and to/** ('/' only itself)
  largeTitle?: boolean  // default true
  order?: number        // lower first; without it, registration order after the ordered ones
}
```

A module adds its tabs from `setup()`; a tab with an existing id replaces its fields (so a host can relabel one):

```ts
import { extendMobileTabs } from '@frigear-nu/mobile/utils'

extendMobileTabs(nuxt, { id: 'events', to: '/events', label: 'Events', icon: 'i-lucide-calendar', sfSymbol: 'calendar' })
```

With `@frigear-nu/menu`, items of the `mobile.tabs` menu are added too (tab fields such as `sfSymbol` in `meta`).

The build fails on invalid tabs (duplicate or malformed ids, no `to`, no icon) and warns about more than five tabs, a
`to` that is not a page and, with native chrome, tabs without an `sfSymbol`.

## Pages

```ts
definePageMeta({
  mobile: {
    title: 'Bill',      // or titleKey
    largeTitle: false,
    tabBar: false,      // hide the tab bar here (true: show it on a page outside the tabs)
    navbar: false,      // no navbar / header
    tab: 'bills',       // select this tab
    back: true,         // back button (default: below a tab's root page)
  },
})
```

## Runtime

- `useCapacitor()`: `platform` (`ios` | `android` | `web`, synchronous), `isNative`, `isIos`, `isAndroid`,
  `has(plugin)`, `load(plugin)`.
- `useMobileTabs()`: `tabs`, `label(tab)`, `title(tab)`.
- `useMobileChrome()`: `state` (mode, visible tabs, active tab, tab bar, header), `native`, `suppress()` (hide the tab
  bar for an overlay of your own; call the returned function to release). Nuxt UI dialogs, slideovers and drawers hide
  it on their own.
- `useNative()`: `haptic('light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection')`,
  `actionSheet({ actions })` (`null` in a browser: show a menu then), `confirm({ title, description, destructive })`
  (native alert / action sheet; `useConfirmDialog` of `@frigear-nu/ui` or a small modal in a browser),
  `share({ title, text, url })`.
- `useMobileToaster()`: props for `<UApp :toaster>`.
- Components: `MobileHeader` (slots `leading`, `trailing`), `MobileTabBar`, `MobileFab` (`label`, `icon`, `to`,
  `items`: an action sheet on a device, a dropdown in a browser).
- Layout `mobile`: header, page, tab bar. Override it with your own `layouts/mobile.vue`.
- CSS variables: `--mobile-inset-top`, `--mobile-inset-bottom`, `--mobile-tabbar-height`; `<html>` gets
  `mobile-platform-<platform>`, `mobile-chrome-native|web` and `mobile-has-tabbar`.
- Hooks: `mobile:deep-link` (`{ url, path, preventDefault }`; OAuth callbacks never reach it),
  `mobile:back-button` (`{ canGoBack, preventDefault }`).

## CLI

```bash
frigear-mobile native [--platform ios|android] [--if-missing]   # cap add + URL schemes, idempotent
frigear-mobile doctor [--strict]                                # plugins and native projects
```

`native` reads the app's resolved settings from `.nuxt/mobile/native.json` (it runs `nuxt prepare` first), adds the
platforms that have `@capacitor/ios` / `@capacitor/android` installed and no folder yet, and patches
`ios/App/App/Info.plist` (`CFBundleURLTypes` with the OAuth redirect scheme and the deep-link schemes,
`NSAllowsLocalNetworking`) and `android/app/src/main/AndroidManifest.xml` (VIEW intent filters, verified app links).
Running it again changes nothing. `--if-missing` returns right away when every platform folder exists.

## Device development

- **Live reload** (`nuxt dev --host 0.0.0.0`, `cap run ios --live-reload`): nuxt-capacitor points the app at the dev
  server and `@frigear-nu/auth` (client mode) rewrites a `localhost` issuer / API base to that host.
- **A build on a phone against a server on this machine**: `MOBILE_LAN=1 nuxt generate` rewrites `localhost` to this
  machine's LAN address (`MOBILE_LAN=192.168.1.20` to choose it). It never applies in `nuxt dev`, and fails with
  `MOBILE_RELEASE=1`, so a LAN address never ships.

## Android

The web tab bar and header are used on Android by default (`nativeChrome: 'all'` for the native ones, with
`androidIcon` drawables). The back button closes an open overlay, goes back, returns to the first tab, then minimizes
the app. Android's WebView origin is `https://localhost`: a plain-http development server is mixed content, so prefer
live reload there.
