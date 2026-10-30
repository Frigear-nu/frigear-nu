<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { PageTabItem } from '../../types'
import { computed } from '#imports'

/**
 * Tabs under a page heading. Link mode: items carry `to` and the route decides which one is active. State mode:
 * bind `v-model` and give items a `value`; clicking one selects it. Icons are hidden on small screens.
 */
const props = defineProps<{
  items: PageTabItem[]
}>()

const model = defineModel<string>()

// State mode once a value is bound, or when the items are values rather than links.
const stateMode = computed(() => model.value !== undefined || props.items.some(item => item.value !== undefined && !item.to))

const links = computed<NavigationMenuItem[]>(() => {
  if (!stateMode.value) return props.items
  // Until something is selected the first tab is the active one.
  const selected = model.value ?? props.items.find(item => item.value !== undefined)?.value
  return props.items.map(item => item.value === undefined || item.to
    ? item
    : {
        ...item,
        active: item.value === selected,
        onSelect: (event: Event) => {
          model.value = item.value
          item.onSelect?.(event)
        },
      })
})
</script>

<template>
  <UNavigationMenu
    :items="links"
    highlight
    class="-mx-1 overflow-x-auto border-b border-default"
    :ui="{ list: 'min-w-max', link: 'px-3 py-2', linkLeadingIcon: 'max-sm:hidden' }"
  />
</template>
