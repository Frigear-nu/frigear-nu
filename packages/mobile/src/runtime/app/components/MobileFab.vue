<script setup lang="ts">
import { computed } from '#imports'
import { useNative } from '../composables/useNative'

/**
 * A floating action button above the tab bar. With `items` it asks which action: a native action sheet on a device,
 * a dropdown menu in a browser. Without, it emits `click` (or links with `to`).
 */
const props = withDefaults(defineProps<{
  /** Accessible name, e.g. "Add bill". */
  label: string
  icon?: string
  to?: string
  /** Actions to choose from. */
  items?: { label: string, icon?: string, destructive?: boolean, onSelect: () => void }[]
}>(), { icon: 'i-lucide-plus', to: undefined, items: undefined })

const emit = defineEmits<{ click: [] }>()
const native = useNative()
const ui = { leadingIcon: 'size-7' }
const menuUi = { content: 'min-w-56', item: 'gap-3 px-3 py-3 text-base', itemLeadingIcon: 'size-6' }
const menuItems = computed(() => (props.items ?? []).map(item => ({
  label: item.label,
  icon: item.icon,
  color: item.destructive ? 'error' as const : undefined,
  onSelect: item.onSelect,
})))

async function choose() {
  void native.haptic('light')
  const choice = await native.actionSheet({ actions: (props.items ?? []).map(item => ({ title: item.label, destructive: item.destructive })) })
  if (choice !== null) props.items![choice]!.onSelect()
}
</script>

<template>
  <UButton
    v-if="items?.length && native.isNative && native.has('actionSheet')"
    :icon="icon"
    size="xl"
    class="fixed right-4 bottom-[calc(var(--mobile-inset-bottom)+1rem)] z-20 size-14 justify-center rounded-full shadow-lg"
    :ui="ui"
    :aria-label="label"
    @click="choose"
  />
  <UDropdownMenu
    v-else-if="items?.length"
    :items="menuItems"
    :content="{ side: 'top', align: 'end' }"
    :ui="menuUi"
  >
    <UButton
      :icon="icon"
      size="xl"
      class="fixed right-4 bottom-[calc(var(--mobile-inset-bottom)+1rem)] z-20 size-14 justify-center rounded-full shadow-lg"
      :ui="ui"
      :aria-label="label"
    />
  </UDropdownMenu>
  <UButton
    v-else
    :icon="icon"
    :to="to"
    size="xl"
    class="fixed right-4 bottom-[calc(var(--mobile-inset-bottom)+1rem)] z-20 size-14 justify-center rounded-full shadow-lg"
    :ui="ui"
    :aria-label="label"
    @click="emit('click')"
  />
</template>
