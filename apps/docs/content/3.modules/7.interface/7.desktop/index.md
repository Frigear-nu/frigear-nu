---
title: Desktop
description: Turns a Nuxt app into a Tauri desktop app for macOS, Windows and Linux, either a static SPA that signs in at a remote issuer or the whole app with its own offline server.
navigation:
  title: Overview
---

Desktop turns a Nuxt app into a desktop app for macOS, Windows and Linux with [Tauri v2](https://v2.tauri.app). It is
the desktop sibling of [Mobile](/modules/interface/mobile): the module writes the parts of the Tauri config it can
derive from your Nuxt config, and the `frigear-desktop` CLI creates and updates the `src-tauri/` project.

The package is `@frigear-nu/desktop`. In remote mode, users sign in through
[Auth in client mode](/modules/identity/auth/client-mode). In local mode, they sign in on the app's own bundled server
(locally, or at an issuer such as frigear.nu through the system browser), or at a remote issuer with
[Auth in resource mode](/modules/identity/auth/resource-mode).

## Modes

| `mode` | What ships in the app |
| --- | --- |
| `remote` (default) | A static SPA (`nuxt generate`). It talks to a remote API and signs in at a remote issuer with OAuth PKCE. |
| `local` | The whole app (SSR, API routes and server modules) compiled into one executable that runs offline on `127.0.0.1`, with a sqlite database in the app-data folder. Users sign in with cookie sessions (Auth in server mode), or at a remote issuer whose access tokens the server accepts (Auth in resource mode). See [Local mode](/modules/interface/desktop/local-mode). |

## What you get

- **Generated Tauri config**: the app id, name, version, window, deep-link schemes and the permissions the features
  use, merged into `src-tauri/` by `frigear-desktop sync`.
- **CLI**: `frigear-desktop init | sync | dev | build | doctor`. See [CLI](/modules/interface/desktop/cli).
- **`useDesktop()`**: whether the app runs in Tauri, the OS, the app version, window controls and `openExternal`.
- **Deep links**: links with the app's scheme open a page of the app. OAuth callbacks are left to Auth.
- **Styling hooks**: `<html class="desktop" data-desktop="macos">` inside the desktop app.
- **Sign-in** (opt-in): through Auth in client mode, in the system browser with the redirect back as a deep link.
- **Local mode**: a bundled server started by the shell, with startup migrations, generated secrets and offline
  defaults.

Everything does nothing in a plain browser, so the same app also runs as a website.

:module-runtime{client}

::note
**Installed for you:** [`@frigear-nu/module-kit`](/modules/platform/module-kit), and
[`@frigear-nu/auth`](/modules/identity/auth) when `authentication` is configured.

**You add:** `@tauri-apps/cli` (dev), `@tauri-apps/api`, and the Tauri plugins your features use. The Rust toolchain
and your OS's prerequisites, see [Prerequisites](/modules/interface/desktop/cli#prerequisites).
::

## Quick setup

::steps

### Install Desktop and Tauri

```bash
pnpm add @frigear-nu/desktop @tauri-apps/api @tauri-apps/plugin-deep-link @tauri-apps/plugin-opener @tauri-apps/plugin-store
pnpm add -D @tauri-apps/cli
# optional, for the features that use them:
pnpm add @tauri-apps/plugin-autostart @tauri-apps/plugin-updater
```

### Add it to nuxt.config.ts

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@frigear-nu/desktop'],
  desktop: {
    appId: 'nu.frigear.crew', // Tauri identifier and, in lowercase, the deep-link and OAuth redirect scheme
    appName: 'Crew',
    window: { width: 1280, height: 800, minWidth: 900 },
  },
  // Optional sign-in, in client mode. See Sign-in below.
  authentication: {
    mode: 'client',
    client: { issuer: 'https://frigear.nu', clientId: 'crew-desktop', scopes: ['openid', 'profile', 'offline_access'] },
  },
})
```

### Create the Tauri project and run it

```bash
npx frigear-desktop doctor    # Rust, @tauri-apps/cli and your OS's prerequisites
npx frigear-desktop init      # src-tauri/ with the Rust plugins, placeholder icons, then sync
npx frigear-desktop dev       # nuxt dev in a Tauri window
npx frigear-desktop build     # nuxt generate, then the installers in src-tauri/target/release/bundle
```

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** `frigear-desktop doctor` reports no blockers, and `frigear-desktop dev` opens the app in a
window titled with your `appName`.
::

## Options

Options go under the `desktop` key.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `appId` | `string` | required | The reverse-DNS app id: Tauri's `identifier` and, in lowercase, the default scheme. |
| `appName` | `string` | `appId` | The product name and the default window title. |
| `version` | `string` | `package.json` version, else `0.1.0` | The app version (semver). |
| `mode` | `'remote' \| 'local'` | `'remote'` | See [Modes](#modes). |
| `spa` | `boolean` | `true` (remote and local with resource auth), `false` (local) | Sets `ssr: false`, because Tauri serves a static build in remote mode. |
| `local` | `object` | see [Local mode](/modules/interface/desktop/local-mode#options) | `binaryName`, `port`, `secureCookie` and `dataDirName` of the bundled server. |
| `window.title` | `string` | `appName` | The window title. |
| `window.width`, `window.height` | `number` | `1280`, `800` | The window size at start. |
| `window.minWidth`, `window.minHeight` | `number` | none | The smallest size. |
| `window.resizable` | `boolean` | `true` | Whether the window can be resized. |
| `window.fullscreen` | `boolean` | `false` | Start fullscreen. |
| `window.kiosk` | `boolean` | `false` | Fullscreen, without title bar and not resizable, for a single-purpose screen. |
| `window.decorations` | `boolean` | `true` | The OS title bar and borders. |
| `window.center` | `boolean` | `true` | Centered on the screen at start. |
| `deepLinks.schemes` | `string[] \| false` | `[appId]` | Custom schemes routed into the app. `false` for none. |
| `singleInstance` | `boolean` | `true` | A second launch, or a deep link on Windows and Linux, goes to the running app. |
| `autostart` | `boolean` | `false` | Adds `tauri-plugin-autostart`, so the app can start at login. |
| `updater` | `{ endpoints, pubkey } \| false` | `false` | Adds `tauri-plugin-updater` with your update endpoints and public key. |
| `devUrl` | `string` | `http://localhost:<devServer.port>` | The URL the window loads under `frigear-desktop dev`. |
| `doctor` | `boolean` | `true` | Warns about missing Tauri packages when dev or build starts. A missing `@tauri-apps/plugin-opener` fails the build, whatever this option says, when local mode turns on the frigear handoff ([Sign in at an issuer with server auth](/modules/interface/desktop/local-mode#sign-in-at-an-issuer-with-server-auth)). |

**`appId`.** Letters, digits, `-` and `.`, in reverse-DNS form. Avoid a last segment of `app`, which clashes with the
macOS bundle extension. In lowercase, with `_` turned into `-`, it becomes the deep-link scheme and Auth's
`client.native.scheme`.

**`singleInstance`.** Keep it on when the app signs in. On Windows and Linux the OS starts a new process for each deep
link, and only the single-instance plugin hands the OAuth redirect to the running app.

**`updater`.** `endpoints` are `https` URLs (Tauri fills in `{{target}}`, `{{arch}}` and `{{current_version}}`), and
`pubkey` is the contents of the public key from `tauri signer generate`. Builds then also produce the signed update
artifacts. Load the plugin with `useDesktop().load('updater')`.

**Runtime config.** `runtimeConfig.public.desktop` holds `appId`, `appName`, `version`, `mode` and
`deepLinks.schemes`.

## What the module writes

On every prepare, dev and build start, the module writes three files to `.nuxt/desktop/`:

| File | What it is |
| --- | --- |
| `tauri.json` | The keys of `tauri.conf.json` the module owns. |
| `capabilities.json` | The capability `frigear` for the `main` window. |
| `manifest.json` | The settings the CLI needs, such as the redirect URI and the Tauri packages the features use. |

`frigear-desktop sync` merges them into `src-tauri/`. The owned keys of `tauri.conf.json` are `productName`,
`version`, `identifier`, `build.frontendDist` (`../.output/public`), `build.devUrl`, the fields of the window labelled
`main` that the options set, `plugins.deep-link.desktop.schemes`, `plugins.updater` when set, `bundle.active` and
`bundle.createUpdaterArtifacts`. Every other key is yours, and sync keeps it.

`src-tauri/capabilities/frigear.json` belongs to the module, and sync rewrites it. Put your own permissions in another
capability file. It grants:

- `core:default`, and `core:window:allow-set-focus`, `-minimize`, `-maximize`, `-unmaximize`, `-toggle-maximize`,
  `-close` and `-set-fullscreen` for the window controls and the focus after sign-in;
- `opener:default` (http, https, mailto and tel links), `deep-link:default` and `store:default`;
- `autostart:default` and `updater:default` when those options are on.

## Sign-in

This section covers remote mode. In local mode Auth runs on the bundled server, in server mode (see
[Sign in at an issuer with server auth](/modules/interface/desktop/local-mode#sign-in-at-an-issuer-with-server-auth)) or
in resource mode (see [Sign in at a remote issuer](/modules/interface/desktop/local-mode#sign-in-at-a-remote-issuer)).

When the app configures `authentication`, Desktop installs Auth and fills in `client.native.scheme` from `appId`. It
never sets the mode: the app sets `authentication.mode: 'client'` itself.

::warning
In remote mode, Auth in server mode fails the build: a Tauri app in remote mode cannot send a same-origin session
cookie to the API. Resource mode fails it too: it needs a server of the app's own, which remote mode does not bundle.
In local mode, client mode fails the build: it has no server half.
::

A production build signs in through the user's default browser and gets the redirect back as a deep link. Under
`frigear-desktop dev` the window loads the dev server, and Auth signs in with a redirect inside the window. See
[Tauri (desktop)](/modules/identity/auth/client-mode#tauri-desktop) for the flows, the token storage and
`client.native.desktopFlow`.

The scheme of Auth's redirect URI is registered with the deep-link schemes, even with `deepLinks.schemes: false`.

### Register the client on the issuer

On an issuer running [`@frigear-nu/oauth-server`](/modules/identity/oauth-server), add the app as a
[configured client](/modules/identity/oauth-server/routes-and-clients#configured-clients):

```ts [nuxt.config.ts (issuer)]
export default defineNuxtConfig({
  oauthServer: {
    cors: { paths: ['/api/'] },
    clients: [{
      id: 'crew-desktop',
      name: 'Crew for desktop',
      // The custom-scheme redirect of a production build: `<appId in lowercase>:/auth/callback`.
      redirectUris: ['nu.frigear.crew:/auth/callback'],
      // Only accepted under `nuxt dev`: the window loads the app's dev server.
      devRedirectUris: ['http://localhost:3000/auth/callback'],
      // The Tauri webview origins: macOS and Linux, then Windows.
      corsOrigins: ['tauri://localhost', 'http://tauri.localhost'],
    }],
  },
})
```

An API behind [`@frigear-nu/oauth-resource`](/modules/identity/oauth-resource) needs the same two origins in its
`corsOrigins`.

## App

### `useDesktop()`

```ts
const { isDesktop, os, getVersion, minimize, toggleMaximize, close, setFullscreen, openExternal, load } = useDesktop()
```

| Name | What it is |
| --- | --- |
| `isDesktop` | `true` inside the Tauri window. `false` in a browser and on the server. |
| `os`, `isMacos`, `isWindows`, `isLinux` | The OS, from the webview's user agent: `macos`, `windows`, `linux` or `unknown`. |
| `getVersion()` | The running app's version, else `desktop.version`. |
| `minimize()`, `maximize()`, `unmaximize()`, `toggleMaximize()`, `close()`, `setFullscreen(on)`, `focus()` | Window controls (need `@tauri-apps/api`). They do nothing in a browser. |
| `openExternal(url)` | Opens the link in the default browser, or in a new tab outside the desktop app. |
| `has(name)`, `load(name)` | Whether a Tauri package is installed, and the package inside the desktop app (`null` elsewhere): `window`, `app`, `deepLink`, `opener`, `store`, `autostart`, `updater`. |

The Tauri packages are optional peers. The module only imports the installed ones, so a missing package never fails
the build.

### Deep links

A link with one of `deepLinks.schemes` opens the matching page, on a cold start and while the app runs:
`nu.frigear.crew:/shifts/12` and `nu.frigear.crew://shifts/12` both open `/shifts/12`. OAuth callbacks are left to
Auth, and other links are ignored. In local mode with server auth, `<scheme>:/auth/return` only brings the window to
the front (the return link of "Log in with frigear.nu"). Change the path, or handle the link yourself, in the `desktop:deep-link` hook:

```ts [app/plugins/deep-links.client.ts]
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('desktop:deep-link', (ctx) => {
    if (ctx.path.startsWith('/legacy/')) ctx.path = ctx.path.replace('/legacy', '')
  })
})
```

The plugin needs `@tauri-apps/plugin-deep-link`. A path the hook returns that would leave the app is ignored.

### Styling

Inside the desktop app the `<html>` element gets the class `desktop` and a `data-desktop` attribute with the OS:

```css
html.desktop body { user-select: none; }
html[data-desktop='macos'] .app-header { padding-left: 80px; } /* room for the traffic lights */
```
