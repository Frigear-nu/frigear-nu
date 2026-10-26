<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

/**
 * A full-width button naming the current section, with a menu of all sections. The narrow-screen counterpart of a
 * vertical section navigation (`UNavigationMenu`), which does not fit beside the content on a phone. Items are links
 * (`to`), and the one with `active` is the current section; `PageTabs` stays for tabs a page owns.
 */
const props = defineProps<{
  items: NavigationMenuItem[]
  /** Overrides the accessible name of the button. */
  label?: string
}>()

const t = useUiT('patterns')

const current = computed(() => props.items.find(item => item.active) ?? props.items[0])

const menu = computed<DropdownMenuItem[]>(() => props.items.map(item => ({
  label: item.label,
  icon: item.icon,
  to: item.to,
  target: item.target,
  external: item.external,
  active: item.active,
  trailingIcon: item.active ? 'i-lucide-check' : undefined,
})))

const ariaLabel = computed(() => {
  const name = props.label ?? t('sections', 'Sections')
  return current.value?.label ? `${name}: ${current.value.label}` : name
})
</script>

<template>
  <UDropdownMenu
    v-if="items.length"
    :items="menu"
    :content="{ align: 'start' }"
    :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      color="neutral"
      variant="outline"
      block
      :icon="current?.icon"
      trailing-icon="i-lucide-chevrons-up-down"
      :label="current?.label"
      :aria-label="ariaLabel"
      :ui="{ trailingIcon: 'ms-auto text-dimmed' }"
    />
  </UDropdownMenu>
</template>
