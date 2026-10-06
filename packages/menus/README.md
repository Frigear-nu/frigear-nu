# @frigear-nu/menus

Named, shareable navigation menus. A **menu** (`main`, `dashboard`, `account`, ...) is a named
collection of items, filled by one or more **sources** - Nuxt Content, other modules (at build
time, or dynamically at runtime), or both at once (content as the base, modules appending) - and
rendered by different **views** (`MenuBar`, `MenuCards`, ...). Data never encodes presentation:
`description`/`icon` are optional fields a view may use or ignore.

## Quick Setup

Install the module to your Nuxt application with one command:

```bash
npx nuxt module add @frigear-nu/menus
```

## Vocabulary

- **Menu** - a named collection of items (`main`, `dashboard`, `account`, ...).
- **Source** - anything that fills a menu: Nuxt Content, `extendMenu`, or a module's
  `runtime/menus.ts` file.
- **Group** - the part after a menu's first dot. `dashboard.more` addresses group `more` of menu
  `dashboard`.
- **View** - a presentation component (`MenuBar`, `MenuCards`) rendering a menu's items.

## Contributing items from another module

### Static items, known at build time

```ts
import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendMenu } from '@frigear-nu/menus/utils'

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
import { registerMenuSource } from '@frigear-nu/menus/utils'

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
import { defineMenuSource } from '@frigear-nu/menus/utils'

export default defineMenuSource((items) => {
  const config = useRuntimeConfig().public.example

  // Pushed into the `dashboard` menu's root group.
  if (config?.enabled) items.push({ label: 'Example', to: '/example' })

  // Pushed into a named group (in this or another menu) instead - created automatically if it
  // doesn't already exist. `extendMenuItem` is auto-imported, no need to import it explicitly.
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

## Reading/rendering a menu

```vue
<script setup lang="ts">
const { data: items } = useMenu('main')
const { data: more } = useMenu('dashboard.more')
</script>

<template>
  <MenuBar menu="main" />
  <MenuCards menu="account" />
</template>
```

Items are sorted by `order` (ascending; items without an `order` render last, in registration
order).
