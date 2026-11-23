# @frigear-nu/desktop

A Tauri v2 desktop shell for Nuxt (macOS, Windows, Linux), the desktop sibling of [`@frigear-nu/mobile`](../mobile):

- **remote mode**: a static SPA (`ssr: false`, `nuxt generate`) in the Tauri window that signs in at a remote issuer
  through [`@frigear-nu/auth`](../auth) in client mode (system browser + deep-link redirect)
- the owned parts of `tauri.conf.json` and a capability file generated from `nuxt.config` (`.nuxt/desktop/`)
- `useDesktop()`: `isDesktop`, the OS, the app version, window controls, `openExternal`, lazy Tauri packages
- deep links with the app's scheme routed to pages (`desktop:deep-link` hook), `<html class="desktop" data-desktop>`
- the `frigear-desktop` CLI: `init` (creates `src-tauri/`), `sync`, `dev`, `build`, `doctor`

Everything does nothing in a plain browser.

## Setup

```bash
pnpm add @frigear-nu/desktop @tauri-apps/api @tauri-apps/plugin-deep-link @tauri-apps/plugin-opener @tauri-apps/plugin-store
pnpm add -D @tauri-apps/cli
```

```ts
export default defineNuxtConfig({
  modules: ['@frigear-nu/desktop'],
  desktop: { appId: 'nu.frigear.crew', appName: 'Crew' },
  authentication: { mode: 'client', client: { issuer: 'https://frigear.nu', clientId: 'crew-desktop' } },
})
```

```bash
npx frigear-desktop doctor && npx frigear-desktop init && npx frigear-desktop dev
```

Docs: https://docs.frigear.dev/modules/interface/desktop
