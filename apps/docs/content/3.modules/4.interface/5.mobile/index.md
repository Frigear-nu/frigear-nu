---
title: Mobile
description: A Capacitor app shell for Nuxt - one tab registry for native and web tab bars, page titles, safe areas, haptics, deep links, the Android back button and a CLI for the iOS and Android projects.
navigation:
  title: Overview
---

This [Nuxt module](https://nuxt.com/docs/4.x/guide/modules) turns a Nuxt app into an iOS / Android app with one config
block. Use it for a Capacitor app on a static `nuxt generate` build with no server of its own. Tabs are registered once (`mobile.tabs`, plus tabs other modules add) and feed the native iOS tab bar, the web tab
bar and the page titles. It builds on [`nuxt-capacitor`](https://github.com/hareland/nuxt-capacitor), which writes
`capacitor.config.json` from your Nuxt config, and signs users in through [Auth in client mode](/modules/identity/auth/client-mode).

:module-runtime{client mobile}

::note
**Requires** [`@frigear-nu/module-kit`](/modules/platform/module-kit), `@nuxt/ui` (`>=4`) and `nuxt-capacitor`, all installed
automatically, and `@capacitor/core` in the app. When `authentication` is configured, [`@frigear-nu/auth`](/modules/identity/auth)
is installed too; the app sets `authentication.mode: 'client'` itself. Optional: [`@frigear-nu/ui`](/modules/interface/ui) (native confirm dialogs fall back to its
`useConfirmDialog`) and [`@frigear-nu/menu`](/modules/interface/menu) (the `mobile.tabs` menu adds tabs).
::

## Quick setup

```bash
pnpm add @frigear-nu/mobile @nuxt/ui @capacitor/core @capacitor/app @capacitor/ios
pnpm add -D @capacitor/cli
# optional, for the features that use them:
pnpm add @capgo/capacitor-native-navigation @capacitor/haptics @capacitor/action-sheet @capacitor/dialog \
  @capacitor/share @capacitor/status-bar @capacitor/keyboard
# with sign-in, and guards:
pnpm add @frigear-nu/authorization @capacitor/browser @capacitor/preferences @aparajita/capacitor-secure-storage
```

Capacitor links the native code of **the app's own dependencies** only, so install the plugins in the app, not just in a
package it depends on. [`frigear-mobile doctor`](/modules/interface/mobile/cli-and-devices#cli) lists the missing ones.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/mobile', '@frigear-nu/authorization'],
  css: ['~/assets/css/main.css'],
  mobile: {
    appId: 'nu.frigear.bills', // capacitor appId and, in lowercase, the OAuth redirect scheme
    appName: 'Bills',
    tabs: [
      { id: 'home', to: '/', label: 'Upcoming', icon: 'i-lucide-calendar-clock', sfSymbol: 'calendar.badge.clock' },
      { id: 'bills', to: '/bills', label: 'Bills', icon: 'i-lucide-receipt-text', sfSymbol: 'list.bullet.rectangle' },
      { id: 'account', to: '/account', label: 'Account', icon: 'i-lucide-circle-user-round', sfSymbol: 'person.crop.circle', requiresAuth: true },
    ],
  },
  // Optional sign-in. Mobile installs @frigear-nu/auth and fills in `client.native.scheme` (from appId); the mode is
  // the app's to set.
  authentication: {
    mode: 'client',
    client: { issuer: 'https://frigear.nu', clientId: 'bills', scopes: ['openid', 'profile', 'offline_access'] },
  },
  // Guards are the app's (@frigear-nu/authorization): signed in everywhere. The login and callback pages stay open.
  authorization: { redirectTo: '/login' },
  routeRules: {
    '/**': { authenticated: true },
  },
})
```

```vue [app/app.vue]
<template>
  <UApp :toaster="useMobileToaster()">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

Build the static app, add the native projects and run it:

```bash
nuxt generate                  # the static SPA in .output/public
npx frigear-mobile native      # npx cap add ios / android, URL schemes in Info.plist / AndroidManifest.xml
npx cap sync && npx cap run ios
```

A script for the loop: `"ios:run": "frigear-mobile native --if-missing && nuxt generate && cap sync ios && cap run ios"`.

The module sets these `nuxt-capacitor` defaults (yours win): `capacitor.autoSync: false`, `capacitor.config.appId` and
`appName`, and the Keyboard plugin's `resize: 'native'`.

## Sign-in

Mobile signs in with [Auth in client mode](/modules/identity/auth/client-mode). When the app configures
`authentication`, Mobile installs Auth and fills in `client.native.scheme` (from `appId`) and, for `MOBILE_LAN` builds,
`client.dev.rewriteLoopback`. It never sets the mode: the app sets `authentication.mode: 'client'` itself.

- **Nothing is protected by default.** Which pages need a user is the app's choice, with
  [Authorization](/modules/identity/authorization) rules such as `'/**': { authenticated: true }`. When Auth signs the
  app in but no route rule or page requires a user, the build warns that every page is public.
- **Tabs.** A tab with `requiresAuth: true` is hidden while signed out. Tabs default to `requiresAuth: false`.
- **Server mode fails.** With Auth in server mode the build fails: a Capacitor app cannot send a same-origin session
  cookie to the API.
- **`oauthClient` fails.** Mobile 0.2 refuses an `oauthClient` block (`@frigear-nu/oauth-client` is deprecated) and
  prints the migration steps. See [Migrating from `@frigear-nu/oauth-client`](/modules/identity/auth/client-mode#migrating-from-frigear-nuoauth-client).

The guards only decide what the app shows. The API decides what is allowed.

## Options

Configured under `mobile`.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `appId` | `string` | `capacitor.config.appId` | Reverse-DNS id. Becomes `capacitor.config.appId` and, lowercased with `_` turned into `-`, the OAuth redirect and deep-link scheme. Without one the build warns and uses `com.example.app`. |
| `appName` | `string` | `capacitor.config.appName`, else `appId` | `capacitor.config.appName` and the fallback page title. |
| `tabs` | `MobileTabDefinition[]` | `[]` | See [Tabs](#tabs). |
| `auth` | `boolean` | on when `@frigear-nu/auth` runs in client mode | The shell follows Auth's sign-in state: tabs with `requiresAuth` show signed in only. It does not decide which pages need a user. |
| `spa` | `boolean` | `true` | Sets `ssr: false`: Capacitor serves a static build. |
| `layout` | `string \| false` | `'mobile'` | Name of the shell layout (also registered as `default` when the app has none). `false` for none. A layout of the app with that name wins. |
| `nativeChrome` | `'ios' \| 'all' \| false` | `'ios'` | Native navbar and tab bar on iOS, on all platforms, or never. Needs `@capgo/capacitor-native-navigation`; without it the web chrome is used. |
| `native.statusBar` | `boolean` | `true` | Status bar text follows the colour mode. |
| `native.keyboardAccessoryBar` | `boolean` | `true` | iOS: the Done bar above the keyboard. |
| `native.switchHaptics` | `boolean` | `true` | A tick when a `role="switch"` is tapped. |
| `native.backButton` | `boolean` | `true` | Android back button: close an overlay, go back, go to the first tab, minimize. |
| `appearance.iosTypeScale` | `boolean` | `true` | iOS text sizes (17pt body). |
| `appearance.tapHighlight` | `boolean` | `true` | No grey tap flash, and `:active` states on iOS. |
| `appearance.toasterOffset` | `boolean` | `true` | `useMobileToaster()` puts toasts at the top, below the navbar. |
| `deepLinks.schemes` | `string[] \| false` | `[appId]` | Custom schemes routed into the app. `false` for none. |
| `deepLinks.hosts` | `string[]` | `[]` | `https` hosts of universal links and app links. |
| `dev.lanHost` | `boolean \| string` | `true` | For `MOBILE_LAN` builds: detect the LAN address, or fix it with a string. See [Device development](/modules/interface/mobile/cli-and-devices#device-development). |
| `ios.allowLocalNetworking` | `boolean` | `true` | `NSAllowsLocalNetworking` in Info.plist (plain http to the LAN). |
| `doctor` | `boolean` | `true` | Warnings about native projects and missing plugins when dev or build starts. |

## Tabs

```ts
interface MobileTabDefinition {
  id: string // native tab id
  to: string // the tab's root page
  label: string
  labelKey?: string // i18n key
  title?: string // navbar title, default: label
  titleKey?: string
  icon: string // Nuxt UI icon of the web tab bar
  activeIcon?: string
  sfSymbol?: string // native iOS tab
  sfSymbolActive?: string
  androidIcon?: string // drawable, with nativeChrome: 'all'
  requiresAuth?: boolean // default: false (hidden while signed out when true)
  match?: string | string[] // default: `to` and `to/**` ('/' matches only itself)
  largeTitle?: boolean // default true
  order?: number // lower first; tabs without it follow in registration order
}
```

A module adds its tabs from `setup()`. A tab with an existing id replaces its fields, so a host can relabel one:

```ts
import { extendMobileTabs } from '@frigear-nu/mobile/utils'

extendMobileTabs(nuxt, { id: 'events', to: '/events', label: 'Events', icon: 'i-lucide-calendar', sfSymbol: 'calendar' })
```

`@frigear-nu/mobile/utils` also exports `defineMobileTab`, `normalizeTabs`, `findActiveTab` and `matchesPath`. With
[Menu](/modules/interface/menu), the items of the `mobile.tabs` menu are added as tabs (tab fields such as `sfSymbol` go in `meta`).

The build fails on invalid tabs (duplicate or malformed ids, no `to`, no icon). It warns about more than five tabs, a `to`
that is not a page and, with native chrome, tabs without an `sfSymbol`.

## Pages

Titles come from page meta, else the selected tab, else `appName`:

```ts
definePageMeta({
  mobile: {
    title: 'Bill', // or titleKey
    largeTitle: false,
    tabBar: false, // hide the tab bar here (true: show it on a page outside the tabs)
    navbar: false, // no navbar or header
    tab: 'bills', // select this tab
    back: true, // back button (default: on pages below a tab's root page)
  },
})
```

## App

| Name | What it is |
| --- | --- |
| `useCapacitor()` | `platform` (`ios`, `android` or `web`, synchronous), `isNative`, `isIos`, `isAndroid`, `has(plugin)`, `load(plugin)`. |
| `useMobileTabs()` | `tabs`, `label(tab)`, `title(tab)`. |
| `useMobileChrome()` | `state` (mode, visible tabs, active tab, tab bar, header), `native`, and `suppress()` to hide the tab bar for an overlay of your own (call the returned function to release). Nuxt UI dialogs, slideovers and drawers hide it on their own. |
| `useNative()` | See [Native features](#native-features). |
| `useMobileToaster()` | Props for `<UApp :toaster>`. |
| `MobileHeader` | The web header. Slots `leading` and `trailing`. |
| `MobileTabBar` | The web tab bar. |
| `MobileFab` | A floating action button: `label`, `icon`, `to`, or `items` (an action sheet on a device, a dropdown in a browser). |
| `mobile` layout | Header, page, tab bar. Override it with your own `layouts/mobile.vue`. |

CSS variables: `--mobile-inset-top`, `--mobile-inset-bottom` and `--mobile-tabbar-height`, the same for native and web
chrome. `<html>` gets `mobile-platform-<platform>`, `mobile-chrome-native` or `mobile-chrome-web`, and `mobile-has-tabbar`.

### Native chrome

On iOS, with `@capgo/capacitor-native-navigation` installed, the navbar and the tab bar are native. In a browser and on
Android the module renders `MobileHeader` and `MobileTabBar` instead (`nativeChrome: 'all'` also uses the native ones on
Android, with `androidIcon` drawables). The shell also applies safe areas, the iOS type scale, `:active` states, no tap
highlight, switch haptics, the keyboard accessory bar and a status bar that follows the colour mode.

### Native features

`useNative()` wraps Capacitor plugins and falls back on the web:

| Method | Plugin | In a browser |
| --- | --- | --- |
| `haptic('light' \| 'medium' \| 'heavy' \| 'success' \| 'warning' \| 'error' \| 'selection')` | `@capacitor/haptics` | Does nothing. |
| `actionSheet({ actions })` | `@capacitor/action-sheet` | Returns `null`: show a menu then. |
| `confirm({ title, description, destructive })` | `@capacitor/dialog` | `useConfirmDialog` of `@frigear-nu/ui`, or a small modal. |
| `share({ title, text, url })` | `@capacitor/share` | The Web Share API, else the link is copied to the clipboard. |

## Hooks

Runtime hooks, called with `useNuxtApp().hook(...)`:

| Hook | Payload | When |
| --- | --- | --- |
| `mobile:deep-link` | `{ url, path, preventDefault }` | A custom scheme or universal link opened the app. Change `path` to route elsewhere, or `preventDefault()` to handle it yourself. OAuth callbacks never reach it. |
| `mobile:back-button` | `{ canGoBack, preventDefault }` | The Android back button, before the module acts. Call `preventDefault()` when you handled it. |

Deep links need `@capacitor/app` and a scheme in `deepLinks.schemes` or a host in `deepLinks.hosts`. The `native`
command registers them in the native projects.

## On this module

- [CLI and devices](/modules/interface/mobile/cli-and-devices): the `frigear-mobile` command, device development, Android and the release checklist.

## Related

- [Auth client mode](/modules/identity/auth/client-mode): sign-in, tokens and `$api`.
- [Authorization](/modules/identity/authorization): the guards.
- [OAuth Resource](/modules/identity/oauth-resource): lets each service the app calls accept the access token.
- [Use your own OAuth server](/guide/going-further/own-oauth-server).
