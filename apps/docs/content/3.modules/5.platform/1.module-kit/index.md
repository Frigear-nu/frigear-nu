---
title: Module Kit
description: Helpers for building Frigear Nuxt modules - pages, URLs, translations, menu sources, virtual registries and extendable database tables.
---

The shared toolkit behind every Frigear [Nuxt module](https://nuxt.com/docs/4.x/guide/modules). Use it to register
pages and translations, to let modules contribute to each other, and to let one module add columns to a table another
module owns, without replacing its schema. Almost every `@frigear-nu/*` module depends on it (account, admin, auth,
authorization, cookie-consent, events, forms, mcp, menu, oauth-server, payments, preferences, stripe, subscriptions,
users, widget); `notify` and `ui` do not. New to writing a module? Start with
[Writing a module](/contribute/writing-a-module/scaffold).

::note
**Requires** `@nuxthub/core` only for the [Database](/modules/platform/module-kit/database) helpers, which also need the `drizzle-orm` and
`drizzle-kit` peer dependencies. Everything else works without NuxtHub. A module opts in with a `moduleDependencies`
entry, which installs module-kit in the host app and is what provides the `useModuleT` auto-import. Hosts need not add
`@frigear-nu/module-kit` to `modules` themselves. The `@frigear-nu/module-kit/utils` helpers are plain imports.
::

## Quick setup

```bash
pnpm add @frigear-nu/module-kit drizzle-orm drizzle-kit
```

```ts
// A module's setup(), importing the helpers it needs
import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { registerModule, registerLocales } from '@frigear-nu/module-kit/utils'

export default defineNuxtModule({
  meta: { name: '@frigear-nu/events', configKey: 'events' },
  moduleDependencies: {
    // Installs module-kit in the host app and provides the `useModuleT` auto-import
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    registerModule('@frigear-nu/events', nuxt)
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
  },
})
```

## Options

The module has one config key, `moduleKit`. It is internal: `registerModule` writes to it, and you do not set it by
hand.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `_modules` | `string[]` | `[]` | Names of the Frigear modules registered in the current Nuxt app (see `registerModule`). |

## Exports

| Import | Contains |
| --- | --- |
| `@frigear-nu/module-kit` | The Nuxt module and everything from `/utils`. |
| `@frigear-nu/module-kit/utils` | Every helper below, except `/schedule`, `/server` and `/testing`. Includes `defaultLocaleNames` (`da: 'Dansk'`, `en: 'English'`), the locales `registerLocales` registers by default. |
| `@frigear-nu/module-kit/schedule` | `Schedule` and `ScheduleMoment` (types), `scheduleSchema` (zod), `isScheduleOpen` and `nextScheduleOpening`. Used by forms and events. |
| `@frigear-nu/module-kit/server` | The [server toolkit](/modules/platform/module-kit/server-toolkit) for route handlers: errors, param schemas, pagination, responses. |
| `@frigear-nu/module-kit/testing` | `expectSchemaParity` and `compareSchemaDialects` (see [One schema file per dialect](/modules/platform/module-kit/database#one-schema-file-per-dialect)), `apiClient` and `expectApiError` (see [Testing routes](/modules/platform/module-kit/server-toolkit#testing-routes)). |

`useModuleT` is auto-imported in app code wherever the module is installed.

### `/schedule`

A schedule is a recurring sale season or a fixed range. Both functions treat an `undefined` schedule as always open.

```ts
import { isScheduleOpen, nextScheduleOpening, scheduleSchema } from '@frigear-nu/module-kit/schedule'
import type { Schedule, ScheduleMoment } from '@frigear-nu/module-kit/schedule'

function isScheduleOpen(schedule: Schedule | undefined, now?: Date): boolean
function nextScheduleOpening(schedule: Schedule | undefined, now?: Date): Date | null
```

## Module helpers

| Helper | Signature | Purpose |
| --- | --- | --- |
| `registerModule` | `(moduleName: string, nuxt: Nuxt) => void` | Adds the name to `nuxt.options.moduleKit._modules`, de-duplicated. |
| `defineModulePage` | `(moduleName: string, page: NuxtPage) => NuxtPage` | Tags a page with `meta.moduleName`, so module pages can be identified later. |
| `resolvePagePath` | `(setting: string \| boolean \| undefined, defaultPath: string) => string \| undefined` | Turns an opt-in page setting into a path: a string is the custom path, `true` the default, anything else no page. |
| `addModulePages` | `(moduleName: string, resolver, pages: ModulePageDefinition[]) => void` | Registers a module's pages through `extendPages`, tagged with the module name. A page whose path is unset or already taken by the host app or another module is skipped, so a host can replace a shipped page by declaring its own at that path. |
| `registerTailwindSource` | `(nuxt: Nuxt, dir: string) => void` | Makes Tailwind scan a module's runtime folder (usually `./runtime/app`). Needs `@nuxt/ui`; does nothing without it. |

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

`registerTailwindSource` is needed because Tailwind only scans the host app and its layers, so classes used in a
module's components would otherwise never be generated. The source is appended to the `ui.css` that `@nuxt/ui`
generates; the host app needs no setup.

### `inlineModuleRuntime`

`inlineModuleRuntime(nuxt, resolver)` prepares the module's `runtime` directory for a consuming app, where the module
is installed in `node_modules` and Nitro would otherwise treat it as a dependency:

- Nitro bundles it instead of externalizing it (`nitro.externals.inline`), so virtual modules such as `#auth/*`
  resolve. It is also pushed onto `build.transpile` for the app side.
- Its server code gets auto-imports. Nitro only auto-imports into `node_modules` files of layers
  (`nitro.imports.exclude`); the helper carves the runtime out, so server utils and routes can use `useNitroApp`,
  `useRuntimeConfig` or another module's server utils without importing them.

Call it in the `setup` of every module that ships a `runtime` directory, so hosts need no Nuxt or Nitro config of their
own. App code (components, composables, plugins, pages) gets no auto-imports in `node_modules`: Nuxt reads
`imports.transform` before modules installed through `moduleDependencies` run. It imports from `#imports` instead,
which the `no-undef` rule of `@frigear-nu/eslint-config` enforces for `src/runtime/**` outside `server/`.

### `addOptionalImports`

Importing a name `#imports` does not have fails the build, so app code cannot import an auto-import of an optional
module (`useMenu` without `@frigear-nu/menu`, `queryCollection` without `@nuxt/content`) from `#imports`.
`addOptionalImports(nuxt, alias, imports)` adds a virtual module of your own that re-exports each name from `#imports`
when its module is installed and exports a stand-in when it is not. Whether it is installed is decided once every module
is done, so module order does not matter.

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

`hasNuxtModule` matches the name a module registers itself with, which is not always its package name
(nuxt-auth-utils is `auth-utils`); check a module you depend on instead (`@frigear-nu/auth`).

## URL helpers

`moduleUrl` and `moduleApiUrl` build kebab-cased paths. They take the module's short name, not the scoped package name
(`'OAuthServer'`, not `'@frigear-nu/oauth-server'`, which would kebab-case to `/frigear-nu-oauth-server`). A `path`
that starts with `/` is absolute, so the module name is not prefixed.

```ts
import { moduleUrl, moduleApiUrl } from '@frigear-nu/module-kit/utils'

moduleUrl('OAuthServer') // => '/o-auth-server'
moduleUrl('OAuthServer', 'login') // => '/o-auth-server/login'
moduleApiUrl('OAuthServer', 'token') // => '/api/o-auth-server/token'
```

## On this module

- [Server toolkit](/modules/platform/module-kit/server-toolkit): routes, errors, params, pagination, responses, bearer CORS and route tests.
- [Registries and menus](/modules/platform/module-kit/registries-and-menus): menu helpers, virtual registries and bootstrap providers.
- [Translations](/modules/platform/module-kit/i18n): registering locales and overriding module strings.
- [Database](/modules/platform/module-kit/database): registering and extending tables, schema files per dialect and migrations.
