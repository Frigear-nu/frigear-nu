---
title: Mobile
description: Turns a Nuxt app into an iOS and Android app with native tab bars, deep links and sign-in.
navigation:
  title: Overview
---

Mobile turns a Nuxt app into an iOS and Android app. You list your tabs once, and the app gets a native tab bar on
iOS, a web tab bar elsewhere, page titles, safe areas, haptics and deep links. Use it for a Capacitor app that ships
as a static build, with no server of its own. To start a new app, copy the
[Mobile starter](/examples/starters/mobile) instead of setting this up by hand.

The package is `@frigear-nu/mobile`. It builds on [`nuxt-capacitor`](https://github.com/hareland/nuxt-capacitor),
which writes `capacitor.config.json` from your Nuxt config. Users sign in through
[Auth in client mode](/modules/identity/auth/client-mode).

## What you get

- **Tabs** (on by default): one tab list for the native iOS tab bar, the web tab bar and the page titles. Other modules
  can add tabs.
- **Layout** (on by default): the `mobile` layout, with a header, the page and a tab bar.
- **Composables and helpers** (on by default): `useCapacitor()`, `useNative()` for haptics, sheets, dialogs and
  sharing, and `useMobileChrome()`.
- **Splash screen** (opt-in, `splashScreen: true`): from the native launch image to the first page. Replace it with
  your own component. See [Splash screen](/modules/interface/mobile/splash-screen).
- **Native behaviour** (on by default): safe areas, the iOS type scale, the Android back button and deep links.
- **Sign-in** (opt-in): through Auth in client mode. See [Sign-in](#sign-in).
- **CLI**: `frigear-mobile` adds the iOS and Android projects and checks your plugins.

:module-runtime{client mobile}

::note
**Installed for you:** [`@frigear-nu/module-kit`](/modules/platform/module-kit), `nuxt-capacitor`, and
[`@frigear-nu/auth`](/modules/identity/auth) when `authentication` is configured.

**You add:** `@nuxt/ui` (4 or later), `@capacitor/core` and the Capacitor plugins your features use.

**Optional:** [`@frigear-nu/ui`](/modules/interface/ui) (its `useConfirmDialog` is the browser fallback for native
dialogs) and [`@frigear-nu/menu`](/modules/interface/menu) (the `mobile.tabs` menu adds tabs).
::

## Quick setup

::steps

### Install Mobile and Capacitor

:::warning
Install the plugins in the app itself, not only in a package it depends on. Capacitor links the native code of the
app's own dependencies only. [`frigear-mobile doctor`](/modules/interface/mobile/cli-and-devices#cli) lists the
missing ones.
:::

```bash
pnpm add @frigear-nu/mobile @nuxt/ui @capacitor/core @capacitor/app @capacitor/ios
pnpm add -D @capacitor/cli
# optional, for the features that use them:
pnpm add @capgo/capacitor-native-navigation @capacitor/haptics @capacitor/action-sheet @capacitor/dialog \
  @capacitor/share @capacitor/status-bar @capacitor/keyboard @capacitor/splash-screen
# with sign-in, and guards:
pnpm add @frigear-nu/authorization @capacitor/browser @capacitor/preferences @aparajita/capacitor-secure-storage
```

### Add it to nuxt.config.ts

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
  // Optional sign-in, in client mode. See Sign-in below.
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

The module sets these `nuxt-capacitor` defaults, and yours win: `capacitor.autoSync: false`, `capacitor.config.appId`
and `appName`, and the Keyboard plugin's `resize: 'native'`.

### Wrap the app

```vue [app/app.vue]
<template>
  <UApp :toaster="useMobileToaster()">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

### Build and run it

```bash
nuxt generate                  # the static SPA in .output/public
npx frigear-mobile native      # npx cap add ios / android, URL schemes in Info.plist / AndroidManifest.xml
npx frigear-mobile doctor      # lists missing plugins and URL schemes
npx cap sync && npx cap run ios
```

A script for the loop: `"ios:run": "frigear-mobile native --if-missing && nuxt generate && cap sync ios && cap run ios"`.

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** `frigear-mobile doctor` reports no missing plugins, and the app opens in the iOS Simulator.
::

## Options

Options go under the `mobile` key.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `appId` | `string` | `capacitor.config.appId` | The reverse-DNS app id. It also gives the redirect and deep-link scheme. |
| `appName` | `string` | `capacitor.config.appName`, else `appId` | `capacitor.config.appName` and the fallback page title. |
| `tabs` | `MobileTabDefinition[]` | `[]` | See [Tabs](#tabs). |
| `auth` | `boolean` | on when Auth runs in client mode | Tabs with `requiresAuth` show only while signed in. |
| `spa` | `boolean` | `true` | Sets `ssr: false`, because Capacitor serves a static build. |
| `layout` | `string \| false` | `'mobile'` | The name of the shell layout. `false` for none. |
| `nativeChrome` | `'ios' \| 'all' \| false` | `'ios'` | Where the navbar and tab bar are native: iOS, all platforms or never. |
| `keepTabsAlive` | `boolean` | `true` | Each tab's own page stays as it was left between tab switches. See [Tab switching](#tab-switching). |
| `tabTransitionDuration` | `number` | `180` | The crossfade between tabs with the native tab bar, in ms. `0` for none. |
| `native.statusBar` | `boolean` | `true` | The status bar text follows the colour mode. |
| `native.keyboardAccessoryBar` | `boolean` | `true` | iOS: the Done bar above the keyboard. |
| `native.switchHaptics` | `boolean` | `true` | A tick when a `role="switch"` is tapped. |
| `native.backButton` | `boolean` | `true` | Handles the [Android back button](/modules/interface/mobile/cli-and-devices#android). |
| `appearance.iosTypeScale` | `boolean` | `true` | iOS text sizes (17pt body). |
| `appearance.tapHighlight` | `boolean` | `true` | No grey tap flash, and `:active` states on iOS. |
| `appearance.toasterOffset` | `boolean` | `true` | `useMobileToaster()` puts toasts at the top, below the navbar. |
| `splashScreen` | `boolean \| string \| SplashScreenOptions` | `false` | The opt-in [splash screen](/modules/interface/mobile/splash-screen): `true`, a component name, or options. |
| `deepLinks.schemes` | `string[] \| false` | `[appId]` | Custom schemes routed into the app. `false` for none. |
| `deepLinks.hosts` | `string[]` | `[]` | The `https` hosts of universal links and app links. |
| `dev.lanHost` | `boolean \| string` | `true` | For `MOBILE_LAN` builds: detect the LAN address, or fix it with a string. |
| `ios.allowLocalNetworking` | `boolean` | `true` | Sets `NSAllowsLocalNetworking` in Info.plist, for plain http to the LAN. |
| `doctor` | `boolean` | `true` | Warns about native projects and missing plugins when dev or build starts. |

**`appId`.** In lowercase, with `_` turned into `-`, it becomes the OAuth redirect and deep-link scheme. Without one,
the build warns and uses `com.example.app`.

**`auth`.** It follows Auth's sign-in state. It does not decide which pages need a user.

**`layout`.** The layout is also registered as `default` when the app has none. A layout of the app with the same name
wins.

**`nativeChrome`.** Native chrome needs `@capgo/capacitor-native-navigation`. Without it, the web chrome is used.

**`dev.lanHost`.** See [Device development](/modules/interface/mobile/cli-and-devices#device-development).

## App

The app side of Mobile: sign-in, tabs, page titles, and the composables and components.

### Sign-in

When the app configures `authentication`, Mobile installs Auth and fills in `client.native.scheme` from `appId`. For
`MOBILE_LAN` builds it also fills in `client.dev.rewriteLoopback`. It never sets the mode: the app sets
`authentication.mode: 'client'` itself.

::warning
With Auth in server mode the build fails. A Capacitor app cannot send a same-origin session cookie to the API.
::

- **Nothing is protected by default.** Which pages need a user is the app's choice, with
  [Authorization](/modules/identity/authorization) rules such as `'/**': { authenticated: true }`. When Auth signs the
  app in but no rule requires a user, the build warns that every page is public.
- **Tabs** default to `requiresAuth: false`. A tab with `requiresAuth: true` is hidden while signed out.

The guards only decide what the app shows. The API decides what is allowed.

### Tabs

A tab definition feeds the native tab bar, the web tab bar and the navbar title.

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

A module adds its tabs from `setup()`. A later tab with the same id replaces its fields, so a host can relabel one:

```ts
import { extendMobileTabs } from '@frigear-nu/mobile/utils'

extendMobileTabs(nuxt, { id: 'events', to: '/events', label: 'Events', icon: 'i-lucide-calendar', sfSymbol: 'calendar' })
```

`@frigear-nu/mobile/utils` also exports `defineMobileTab`, `normalizeTabs`, `findActiveTab` and `matchesPath`. With
[Menu](/modules/interface/menu), the items of the `mobile.tabs` menu are added as tabs and replace tabs with the same
id. Tab fields such as `sfSymbol` go in the item's `meta`.

The build fails on an invalid id, or a tab without `to`, `label` or `icon`. It warns about more than five tabs, two
tabs with the same `to`, a `to` that is not a page and, with native chrome, a tab without an `sfSymbol`.

### Pages

A page sets its title and chrome in `definePageMeta`. The title comes from page meta, else the selected tab, else
`appName`.

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

#### Navbar actions

A page adds buttons to the navbar with `actions`, such as a settings gear on the home page. On iOS they are native
navbar buttons (`sfSymbol`), elsewhere icon buttons in `MobileHeader` (`icon`). They show on that page only.

```ts
definePageMeta({
  mobile: {
    actions: [
      { id: 'settings', label: 'Settings', icon: 'i-lucide-settings', sfSymbol: 'gearshape', to: '/settings' },
    ],
  },
})
```

| Field | What it is |
| --- | --- |
| `id` | Stable id. |
| `label` / `labelKey` | Accessible name, and the button text when the platform has no icon for it. |
| `icon` | Nuxt UI icon in `MobileHeader`, e.g. `i-lucide-settings`. |
| `sfSymbol` | SF Symbol of the native iOS button, e.g. `gearshape`. |
| `androidIcon` | Android drawable of the native button (with `nativeChrome: 'all'`). |
| `placement` | `right` (default) or `left`. Left actions sit after the back button. |
| `onSelect` | Called on a tap. |
| `to` | Navigated to on a tap, after `onSelect`. |
| `disabled` | Greyed out and not tappable. |

For actions that change, or that call into the page, use `useMobileNavbarActions()` in the page's `<script setup>`
with a ref or a getter. The actions are added in setup and removed on unmount, and while a kept-alive page is in the
background. They follow the `definePageMeta` ones; one with the same `id` replaces it. With `spa: false` they show
once the page is set up in the browser, not in the server HTML: put actions that must be there in `definePageMeta`.

```ts
const saving = ref(false)
useMobileNavbarActions(() => [
  { id: 'save', label: 'Save', sfSymbol: 'checkmark', icon: 'i-lucide-check', disabled: saving.value, onSelect: save },
])
```

### Composables and components

The composables and components below are auto-imported.

| Name | What it is |
| --- | --- |
| `useCapacitor()` | `platform` (`ios`, `android` or `web`), `isNative`, `isIos`, `isAndroid`, `has(plugin)` and `load(plugin)`. |
| `useMobileTabs()` | `tabs`, `label(tab)` and `title(tab)`. |
| `useMobileChrome()` | `state`, `native` and `suppress()`, which hides the tab bar until you call the function it returns. |
| `useMobileNavbarActions(actions)` | Navbar buttons of the calling page, from a ref or a getter. See [Navbar actions](#navbar-actions). |
| `useNative()` | See [Native features](#native-features). |
| `onTabEnter(fn)` | Runs `fn` when the user comes back to a page kept alive. See [Tab switching](#tab-switching). |
| `useMobileToaster()` | Props for `<UApp :toaster>`. |
| `useMobileSplash()` | `visible`, `hold()`, `waitFor(promise)` and `hide()`: see [Splash screen](/modules/interface/mobile/splash-screen#keep-it-up). |
| `MobileHeader` | The web header, with the page's navbar actions and `leading` and `trailing` slots. |
| `MobileTabBar` | The web tab bar. |
| `MobileSplashScreen` | The default splash screen. Your own `components/Mobile/SplashScreen.vue` replaces it. |
| `MobileFab` | A floating action button: `label`, `icon`, `to`, or `items` for an action sheet on a device. |
| `mobile` layout | Header, page and tab bar. Your own `layouts/mobile.vue` replaces it. |

Nuxt UI dialogs, slideovers and drawers hide the tab bar on their own; `suppress()` is for an overlay of your own. In a
browser, `MobileFab` with `items` opens a dropdown instead of an action sheet.

The CSS variables `--mobile-inset-top`, `--mobile-inset-bottom` and `--mobile-tabbar-height` are the same for native
and web chrome. `<html>` gets the classes `mobile-platform-<platform>`, `mobile-chrome-native` or `mobile-chrome-web`,
and `mobile-has-tabbar`.

### Native chrome

On iOS, with `@capgo/capacitor-native-navigation` installed, the navbar and the tab bar are native. In a browser and on
Android the module draws `MobileHeader` and `MobileTabBar` instead. `nativeChrome: 'all'` uses the native ones on
Android too, with `androidIcon` drawables.

### Tab switching

Switching tabs works like a native tab bar. The page you leave stays as it was, and the page you open appears only once
it is ready.

- **Tab pages stay alive.** A tab's own page (its `to`) stays mounted, with its scroll position and data, when you
  switch to another tab. Pages below a tab still remount. A page opts out with `definePageMeta({ keepalive: false })`,
  and `keepTabsAlive: false` turns this off for the app.
- **Tab pages load up front.** The code of every tab's page is preloaded once the app is ready.
- **No half-built pages with native chrome.** A tap in the native tab bar covers the WebView with a snapshot of the old
  page. The new page renders under it, the navbar title changes, and then the snapshot crossfades away.

The crossfade waits for every async `setup` of the new page, up to one second. Await a tab page's first request, so the
page is revealed with its data and not with a skeleton. Then refresh it in the background with `onTabEnter`, which runs
each time the user comes back to the page, but not on the first visit:

```vue
<script setup lang="ts">
const { data: me, status, refresh } = await useApi<Me>('/api/me')
onTabEnter(() => refresh())
</script>

<template>
  <!-- A skeleton only while there is no data yet, not during a background refresh. -->
  <USkeleton v-if="!me && status === 'pending'" class="h-10 w-full" />
</template>
```

::note
The crossfade uses the plugin's `beginTransition`, which the starters' version (8.16) has. A plugin version without
it switches tabs without a crossfade.
::

### Native features

`useNative()` wraps Capacitor plugins and falls back in a browser:

| Method | Plugin | In a browser |
| --- | --- | --- |
| `haptic('light' \| 'medium' \| 'heavy' \| 'success' \| 'warning' \| 'error' \| 'selection')` | `@capacitor/haptics` | Does nothing. |
| `actionSheet({ actions })` | `@capacitor/action-sheet` | Returns `null`: show a menu then. |
| `confirm({ title, description, destructive })` | `@capacitor/dialog` | `useConfirmDialog` of `@frigear-nu/ui`, or a small modal. |
| `share({ title, text, url })` | `@capacitor/share` | The Web Share API, else the link is copied to the clipboard. |

## Hooks

Your app answers these runtime [hooks](/guide/concepts/glossary) with `useNuxtApp().hook(...)`.

| Hook | Payload | When |
| --- | --- | --- |
| `mobile:deep-link` | `{ url, path, preventDefault }` | A custom scheme or universal link opened the app. OAuth callbacks never reach it. |
| `mobile:back-button` | `{ canGoBack, preventDefault }` | The Android back button was pressed, before the module acts. |

**`mobile:deep-link`.** Change `path` to route elsewhere, or call `preventDefault()` to handle the link yourself. Deep
links need `@capacitor/app` and a scheme in `deepLinks.schemes` or a host in `deepLinks.hosts`. The `native` command
registers them in the native projects.

**`mobile:back-button`.** Call `preventDefault()` when you handled the button.

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [CLI and devices](/modules/interface/mobile/cli-and-devices) | The `frigear-mobile` command, testing on a phone, Android and the release checklist. | App developers |
| [Splash screen](/modules/interface/mobile/splash-screen) | The opt-in splash screen from the native launch image to the first page: turn it on, replace it, keep it up. | App developers |

## Next steps

- [Mobile CLI and devices](/modules/interface/mobile/cli-and-devices) – run the app on a phone and prepare a release.
- [Use your own OAuth server](/guide/going-further/own-oauth-server) – point the app at an issuer you run.
- [Authorization](/modules/identity/authorization) – choose which pages need a signed-in user.
- [OAuth Resource](/modules/identity/oauth-resource) – let each service the app calls accept its access token.
