# @frigear-nu/menu

Named, shareable navigation menus. A **menu** (`main`, `dashboard`, `account`, ...) is a named
collection of items, filled by one or more **sources** - Nuxt Content, other modules (at build
time, or dynamically at runtime), or both at once (content as the base, modules appending). This
package is presentation-free: it only exposes data (`useMenu`) - `description`/`icon` are optional
fields a consumer may render however it likes, or ignore.

## Quick Setup

Install the module to your Nuxt application with one command:

```bash
npx nuxt module add @frigear-nu/menu
```

## Vocabulary

- **Menu** - a named collection of items (`main`, `dashboard`, `account`, ...).
- **Group** - the part after a menu's first dot. `dashboard.more` addresses group `more` of menu
  `dashboard`.
- **Source** - anything that fills a menu: Nuxt Content, `extendMenu`, or a module's
  `runtime/menus.ts` file.

## Contributing items from another module

### Static items, known at build time

```ts
import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendMenu } from '@frigear-nu/menu/utils'

export default defineNuxtModule({
  meta: { name: '@frigear-nu/example' },
  setup(options, nuxt) {
    // `'dashboard.more'` is parsed as menu `dashboard`, group `more` (split on the first dot only).
    extendMenu(nuxt, 'dashboard.more', [
      { label: 'Billing', description: 'Manage your subscription', to: '/billing' },
    ])
  },
})
```

### Dynamic items, needing runtime context (e.g. `useRuntimeConfig`)

```ts
import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { registerMenuSource } from '@frigear-nu/menu/utils'

export default defineNuxtModule({
  meta: { name: '@frigear-nu/example' },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    registerMenuSource(nuxt, {
      file: resolver.resolve('./runtime/menus'),
      menu: 'dashboard',
    })
  },
})
```

```ts
// runtime/menus.ts
import { defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

export default defineMenuSource((items) => {
  const config = useRuntimeConfig().public.example

  // Pushed into the `dashboard` menu's root group.
  if (config?.enabled) items.push({ label: 'Example', to: '/example' })

  // Pushed into a named group (in this or another menu) instead - created automatically if it
  // doesn't already exist. `extendMenuItem` pushes into shared app state, so it only works from
  // code that actually runs as part of the Nuxt app (like this file) - not from a module's own
  // build-time `setup()` (use `extendMenu` there instead).
  extendMenuItem('dashboard.more', { label: 'Security', to: '/security' })
})
```

Registration order between modules doesn't matter for either approach - items are only merged
once every module has finished setting up.

## Nuxt Content source

Enable the `@nuxt/content`-backed source for a menu (requires `@nuxt/content` to be installed):

```ts
export default defineNuxtConfig({
  menus: {
    content: {
      // Reads `config.navigation` (the collection/field defined by `@frigear-nu/base`).
      main: true,
      // ...or a custom collection/field:
      dashboard: { collection: 'dashboard', field: 'tiles' },
    },
  },
})
```

Content items are localized automatically when `@nuxtjs/i18n` is configured with `locales`,
following the same `config` -> `config_en` collection-suffix convention as `@frigear-nu/base`.

## Reading a menu

`useMenu` is auto-imported. It returns the same shape as `useAsyncData`
(`{ data, pending, error, refresh }`) - rendering is entirely up to the consumer:

```vue
<script setup lang="ts">
const { data: items } = useMenu('main')
const { data: more } = useMenu('dashboard.more')
</script>

<template>
  <nav>
    <NuxtLink
      v-for="item in items"
      :key="item.id"
      :to="item.to"
    >
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
```

Items are sorted by `order` (ascending; items without an `order` render last, in registration
order).

### Wildcard reads

A path ending in `.*` reads every matching group, flattened into one list, instead of a single
exact group - useful for rendering a whole menu "tree" at once:

```ts
// Every group of the `dashboard` menu (root group included).
const { data: all } = useMenu('dashboard.*')

// `account` and every group nested under it (e.g. `dashboard.account.sub`), but not sibling
// groups like `dashboard.more`.
const { data: accountTree } = useMenu('dashboard.account.*')
```

Wildcards are only supported when reading a menu - `extendMenu`/`extendMenuItem` reject a
wildcard path, since items can only ever be registered into one exact group.
