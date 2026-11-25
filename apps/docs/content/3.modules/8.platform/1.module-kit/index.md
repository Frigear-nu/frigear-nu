---
title: Module Kit
description: The shared helpers every Frigear module is built on, so modules register pages, routes and tables the same way.
navigation:
  title: Overview
---

You are writing a Frigear [module](/guide/concepts/glossary) and need it to add pages, routes, translations and tables
the way every other module does. Module Kit gives you those helpers, plus ways to add to other modules without
importing them. If you build an app, you never install it yourself. To start a new module, follow
[Writing a module](/contribute/writing-a-module/scaffold) instead.

The package is `@frigear-nu/module-kit`. Every `@frigear-nu/*` module depends on it. Only the
[base layer](/guide/concepts/glossary) does not.

## What you get

- **Pages.** `addModulePages` registers a module's pages so a [host app](/guide/concepts/glossary) can replace any of
  them. On when you call it.
- **Server routes.** `addModuleRoutes` and the [server toolkit](/modules/platform/module-kit/server-toolkit) for
  errors, parameters, pagination and responses. Opt-in import.
- **Composables and helpers.**
  - `useModuleT`, translations that fall back to English without i18n. Auto-imported wherever a module is installed.
  - Menu sources, [registries](/guide/concepts/glossary) and bootstrap providers, so modules add to each other.
  - Database helpers that let one module own a table while others add columns.
  - Test helpers for routes and for schema parity between dialects.
- **Emails.** None.

:module-runtime{server}

::note
**Installed for you:** nothing.
**You add:** `@frigear-nu/module-kit` as a dependency of your module.
**Optional:** `drizzle-orm` and `drizzle-kit` (peer dependencies) and [NuxtHub](/guide/concepts/glossary) in the host
app, for the [database helpers](/modules/platform/module-kit/database).
::

## Quick setup

::steps

### Install the package

```bash
pnpm add @frigear-nu/module-kit
```

### Declare it in your module

List Module Kit in `moduleDependencies`. That installs it in the host app and provides the `useModuleT` auto-import.

```ts [src/module.ts]
import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { inlineModuleRuntime, registerLocales, registerModule } from '@frigear-nu/module-kit/utils'

export default defineNuxtModule({
  meta: { name: '@frigear-nu/events', configKey: 'events' },
  moduleDependencies: {
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    registerModule('@frigear-nu/events', nuxt)
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    inlineModuleRuntime(nuxt, resolver)
  },
})
```

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** a host app that installs your module builds, and your components can import `useModuleT`
from `#imports`.
::

## Options

Options go under the `moduleKit` key. The key is internal: `registerModule` writes to it, and you never set it by
hand.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `_modules` | `string[]` | `[]` | The Frigear modules registered in this app, de-duplicated. |

## Exports

Import each helper from the entry that holds it. `useModuleT` is the only auto-import.

| Import | Contains |
| --- | --- |
| `@frigear-nu/module-kit` | The Nuxt module, and everything from `/utils`. |
| `@frigear-nu/module-kit/utils` | Every build-time helper on these pages, and `defaultLocaleNames` (`da`, `en`). |
| `@frigear-nu/module-kit/schedule` | The `Schedule` type, `scheduleSchema` (zod), `isScheduleOpen` and `nextScheduleOpening`. |
| `@frigear-nu/module-kit/id` | `newId` and `randomToken`. |
| `@frigear-nu/module-kit/crypto` | Hashes, HMAC, HKDF, `timingSafeEqual` and the byte encodings. |
| `@frigear-nu/module-kit/time` | Wall-clock times in a time zone: `zonedTimeToUtc`, `dayKey`, `clockOf` and the rest. |
| `@frigear-nu/module-kit/server` | The [server toolkit](/modules/platform/module-kit/server-toolkit) for route handlers. |
| `@frigear-nu/module-kit/secret` | [Module secrets](/modules/platform/module-kit/server-toolkit#module-secrets) that fall back to a key derived from `NUXT_APP_SECRET`. Server only, inside a Nuxt build. |
| `@frigear-nu/module-kit/testing` | [Route test helpers](/modules/platform/module-kit/server-toolkit#testing-routes) and [schema parity](/modules/platform/module-kit/database#one-schema-file-per-dialect) checks. |

### `/schedule`

A schedule is a recurring sale season or a fixed date range. Forms and Events use it. Both functions treat an
`undefined` schedule as always open.

```ts
import { isScheduleOpen, nextScheduleOpening, scheduleSchema } from '@frigear-nu/module-kit/schedule'
import type { Schedule, ScheduleMoment } from '@frigear-nu/module-kit/schedule'

function isScheduleOpen(schedule: Schedule | undefined, now?: Date): boolean
function nextScheduleOpening(schedule: Schedule | undefined, now?: Date): Date | null
```

### `/time`

A time someone types (`18:00` on `2027-06-28`) means the app's time zone, not the server's or the browser's. These
helpers turn it into an instant and back with `Intl` only, so they stay right across daylight saving changes on any
runtime. Pass the zone in: the app's is `appConfig.frigearUi.timeZone` (see
[useFormat](/modules/interface/ui/composables)).

| Helper | Returns |
| --- | --- |
| `zonedTimeToUtc(day, clock, timeZone)` | The instant of a `YYYY-MM-DD` day at `HH:mm` in the zone. |
| `dayKey(instant, timeZone)`, `clockOf(instant, timeZone)` | The `YYYY-MM-DD` day and `HH:mm` time of an instant in the zone. |
| `zonedParts(instant, timeZone)`, `zoneOffset(instant, timeZone)` | The wall-clock parts, and how far the zone is ahead of UTC in milliseconds. |
| `addDays(day, days)`, `shiftByDays(instant, days, timeZone)` | A day plus days, and an instant moved by days at the same local time. |
| `isDay(value)`, `isClock(value)`, `isValidTimeZone(timeZone)` | Whether a value is a `YYYY-MM-DD` day, an `HH:mm` time or a zone this runtime knows. |

A time that daylight saving skips or repeats resolves to one of the instants next to it.

### `/id` and `/crypto`

Record ids, random tokens and the crypto every module needs, written once and tested against known-answer vectors.
They use Web Crypto only, so they run in Node, on Cloudflare Workers and in the browser. `/server` exports them too.

| Helper | Returns |
| --- | --- |
| `newId(prefix?)` | `<prefix>_` and 32 hex characters (a v4 UUID without dashes): `newId('opr')`. |
| `randomToken(bytes = 32, encoding = 'base64url')` | Random bytes as unpadded base64url (43 characters for 32 bytes) or `'hex'`. |
| `sha256Hex(value)`, `sha256Base64Url(value)` | The SHA-256 of a string (UTF-8) or bytes. The base64url one is also PKCE's S256 challenge. |
| `hmacSha256Hex(secret, data)` | The HMAC-SHA-256, as hex. |
| `verifyHmacSha256Hex(secret, data, signature)` | Whether a hex signature (any case) matches, compared in constant time. |
| `timingSafeEqual(a, b)` | String equality in time that does not depend on where they differ. |
| `deriveHkdfKey(secret, { salt, info }, algorithm, usages)` | A `CryptoKey` derived with HKDF-SHA-256, such as an HMAC or AES-GCM key. |
| `bytesToHex`, `bytesToBase64Url`, `base64UrlToBytes` | The byte encodings. |

Your module keeps its own token format on top: a prefix, the encoding of the stored hash. Never change either once
tokens exist, or the stored hashes stop matching.

```ts
import { randomToken, sha256Hex } from '@frigear-nu/module-kit/server'

const token = `ffk_${randomToken()}` // shown once
const tokenHash = await sha256Hex(token) // stored
```

## Module helpers

These helpers run in your module's `setup()`.

| Helper | Signature | Purpose |
| --- | --- | --- |
| `registerModule` | `(moduleName: string, nuxt: Nuxt) => void` | Adds the name to `moduleKit._modules`. |
| `defineModulePage` | `(moduleName: string, page: NuxtPage) => NuxtPage` | Tags a page with `meta.moduleName`. |
| `resolvePagePath` | `(setting: string \| boolean \| undefined, defaultPath: string) => string \| undefined` | A string is a custom path, `true` the default path, anything else no page. |
| `addModulePages` | `(moduleName: string, resolver, pages: ModulePageDefinition[]) => void` | Registers pages tagged with the module name. |
| `addPageRedirects` | `(nuxt: Nuxt, redirects: Record<string, string>, options?: { statusCode? }) => string[]` | A `redirect` route rule (`302` by default) from each old path to its new one, under every i18n locale prefix. A rule the app set keeps its own `redirect`. A `/**` pair keeps the rest of the path on the server. |
| `resolveDashboardHubPath` | `(nuxt: Nuxt, options?: { dependency?: boolean }) => string \| undefined` | The path of the signed-in hub of [Dashboard](/modules/interface/dashboard#the-hub) (`/dashboard`), or `undefined` without one. `dependency: true` when the module requires Dashboard and Auth (Nuxt installs dependencies after the module). |
| `isPathUnder`, `joinPagePath` | `(path, base) => boolean`, `(base, path) => string` | Whether a path is a base or below it; a path below a base. |
| `registerTailwindSource` | `(nuxt: Nuxt, dir: string) => void` | Makes Tailwind scan a folder of your module, usually `./runtime/app`. |

```ts
import { addModulePages, resolvePagePath } from '@frigear-nu/module-kit/utils'

addModulePages('@frigear-nu/events', resolver, [
  {
    name: 'events',
    path: resolvePagePath(options.settings?.pages?.events, '/events'),
    file: './runtime/app/pages/events.vue',
  },
])
```

```ts
interface ModulePageDefinition {
  name: string
  /** The route path; when `undefined` the page is not registered. */
  path: string | undefined
  /** The page component, relative to the module's `resolver`. */
  file: string
}
```

**`addModulePages`** skips a page whose path is unset or already taken by the host app or another module. So a host
app replaces a shipped page by adding its own page at that path.

**A signed-in area in the hub.** A module whose page belongs to the signed-in user puts its default below the hub when
there is one, and redirects the path it had before, as Crew, Events and Help Center do:

```ts
const hub = resolveDashboardHubPath(nuxt)
const ticketsPath = resolvePagePath(options.settings?.pages?.tickets, hub ? joinPagePath(hub, 'tickets') : '/account/tickets')
if (options.settings?.pages?.tickets === true && ticketsPath !== '/account/tickets') {
  addPageRedirects(nuxt, { '/account/tickets': ticketsPath! })
}
```

**`registerTailwindSource`** exists because Tailwind only scans the host app and its layers. Without it, classes in
your components are never generated. It appends the folder to the `ui.css` that `@nuxt/ui` generates, and does
nothing without `@nuxt/ui`.

### `inlineModuleRuntime`

Call `inlineModuleRuntime(nuxt, resolver)` in the `setup()` of every module that ships a `runtime` directory. A
published module lives in `node_modules`, where [Nitro](/guide/concepts/glossary) would treat it as an external
dependency. The helper changes two things:

- Nitro bundles the runtime instead of externalizing it, so virtual modules such as `#auth/*` resolve. It is also
  added to `build.transpile` for the app side.
- Server code in the runtime gets auto-imports, such as `useRuntimeConfig` or another module's server utils.

Host apps then need no Nuxt or Nitro config of their own.

Both work on Nitro v2 and v3 (Nuxt 4.7 builds with v3 when the app lists `nitro`): on v2 the runtime goes into
`externals.inline`, on v3 Nuxt turns `build.transpile` into `noExternals` itself. To bundle other files, such as
templates a module ships, call `bundleServerDependencies(nuxt, config, paths)` from a `nitro:config` hook: it writes
whichever of the two options the host's Nitro has.

### Nitro v2 and v3

Modules run on Nitro v3 through Nuxt's `nitroLegacy` layer, which keeps h3 v1 helpers, `nitropack` imports and the
server auto-imports working. Until each module moves to `nuxt/server`, keep to what the layer covers:

- Register plugins with `addNitroPlugin` (`addServerPlugin` is its old name).
- Augment `nitropack` or `nitropack/types` (`NitroRuntimeHooks`, `NitroRouteConfig`): the layer maps both to
  `nitro/types`. Augmentations of `nitropack/runtime` or `#internal/nitro` do not carry over.
- `return sendRedirect(...)`, and throw errors through `apiError` (`/server`), which sets both `statusCode` and
  `status`.
- Branch on `getNitroVersion(nuxt)` (`@nuxt/kit`) for Nitro options v3 removed, such as `externals` and
  `moduleSideEffects`; Nuxt warns about each one it ignores (`NUXT_B9001`).
- Route rule patterns: use `/path` and `/path/**`. A single `*` matches one segment on v2 and many on v3.

The `Nitro v3` workflow (`.github/workflows/nitro-v3.yml`) runs module tests on Nitro v3, by hand on a branch
(`gh workflow run nitro-v3.yml --ref <branch>`).

::warning
App code in `src/runtime/**` outside `server/` gets no auto-imports in `node_modules`. Import from `#imports`
explicitly. The `no-undef` rule of `@frigear-nu/eslint-config` enforces it.
::

### `addOptionalImports`

App code cannot import an auto-import of an optional module from `#imports`, such as `useMenu` without Menu: the
build fails. `addOptionalImports(nuxt, alias, imports)` adds a virtual module of your own instead. It re-exports each
name when its module is installed and exports a stand-in when it is not. It decides once every module is done, so
module order does not matter.

```ts [module.ts]
addOptionalImports(nuxt, '#account/optional', [{
  name: 'useMenu',
  available: () => hasNuxtModule('@frigear-nu/menu', nuxt),
  fallback: 'undefined',
  fallbackType: 'undefined',
}])
```

```ts [runtime/app/composables/useAccountNav.ts]
import { useMenu } from '#account/optional'

const menu = typeof useMenu === 'function' ? useMenu('account') : undefined
```

::tip
`hasNuxtModule` matches the name a module registers itself with, which is not always its package name. For example,
nuxt-auth-utils is `auth-utils`. Check a Frigear module you depend on, such as `@frigear-nu/auth`, instead.
::

## URL helpers

`moduleUrl` and `moduleApiUrl` build kebab-cased paths from the module's short name. Pass `'OAuthServer'`, not
`'@frigear-nu/oauth-server'`, which would become `/frigear-nu-oauth-server`. A `path` that starts with `/` is
absolute and gets no module prefix.

```ts
import { moduleUrl, moduleApiUrl } from '@frigear-nu/module-kit/utils'

moduleUrl('OAuthServer') // => '/o-auth-server'
moduleUrl('OAuthServer', 'login') // => '/o-auth-server/login'
moduleApiUrl('OAuthServer', 'token') // => '/api/o-auth-server/token'
```

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [Server toolkit](/modules/platform/module-kit/server-toolkit) | Registering routes, errors, parameters, pagination, responses, bearer CORS and route tests. | Module authors |
| [Registries and menus](/modules/platform/module-kit/registries-and-menus) | Menu sources, registries and bootstrap providers. | Module authors |
| [Translations](/modules/platform/module-kit/i18n) | Shipping locale files, and overriding module strings. | Module authors and app developers |
| [Database helpers](/modules/platform/module-kit/database) | Registering and extending tables, one schema file per dialect, and migrations. | Module authors |

## Next steps

- [Module Kit server toolkit](/modules/platform/module-kit/server-toolkit) – add your module's first route.
- [Module Kit database helpers](/modules/platform/module-kit/database) – give your module a table of its own.
- [Module Kit translations](/modules/platform/module-kit/i18n) – ship your module's strings in Danish and English.
- [Extension points](/guide/concepts/extension-points) – choose between a registry and a hook.
