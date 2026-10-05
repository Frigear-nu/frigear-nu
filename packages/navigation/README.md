# @frigear-nu/navigation

A module for registering navigation/dashboard tiles ("cards") from other frigear modules, in an intuitive, typed way
- without those modules needing to know about each other, and without losing the ability to attach an `onClick`
handler (which can't be done by simply passing data across the module boundary).

## Quick Setup

Install the module to your Nuxt application with one command:

```bash
npx nuxt module add @frigear-nu/navigation
```

## How other modules register tiles

A module that wants to contribute tiles to the dashboard registers a `runtime/navigation.ts` file during its own
`setup()`:

```ts
import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { registerNavigationFile } from '@frigear-nu/navigation/utils'

export default defineNuxtModule({
  meta: { name: '@frigear-nu/example' },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    registerNavigationFile(nuxt, {
      resolver,
      file: './runtime/navigation',
    })
  },
})
```

```ts
// runtime/navigation.ts
import { defineNavigationFile } from '@frigear-nu/navigation/utils'

export default defineNavigationFile((items) => {
  // Pushed into the root group.
  items.push({ title: 'Profile', description: 'Manage your profile', to: '/account/profile', icon: 'i-lucide-user' })

  // Pushed into a named (optionally nested, e.g. `'account.menu'`) group instead - created
  // automatically if it doesn't already exist.
  extendNavigationItem('account.menu', {
    title: 'Security',
    to: '/account/security',
    onClick: () => console.log('Security tile clicked'),
  })
})
```

`extendNavigationItem` is auto-imported - there's no need to import it explicitly.

Registration order between modules doesn't matter: every registered file is only read once, after every module has
finished setting up.

## Reading tiles in the app

```vue
<script setup lang="ts">
const tiles = useNavigation() // root group
const accountMenuTiles = useNavigation('account.menu')
</script>

<template>
  <UPageGrid>
    <UPageCard
      v-for="tile in tiles"
      :key="tile.id ?? tile.title"
      :title="tile.title"
      :description="tile.description"
      :icon="tile.icon"
      :to="tile.to"
      @click="tile.onClick?.()"
    />
  </UPageGrid>
</template>
```

Items are sorted by `order` (ascending; items without an `order` render last, in registration order).
