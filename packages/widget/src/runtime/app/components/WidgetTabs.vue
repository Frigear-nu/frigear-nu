<script setup lang="ts">
import { getTabComponent } from '../utils/tabs'
import { computed, nextTick, ref, useRoute, useTabs, watch } from '#imports'

// Renders every tab registered for `name` as a tab list with the active tab's component below it. The active
// tab is kept in the `?tab=` query parameter. Each tab component receives its static `props`, then every entry
// of `context` as a prop, and may emit `refresh`.
const props = defineProps<{ name: string, context?: Record<string, unknown> }>()
const emit = defineEmits<{ refresh: [] }>()

const route = useRoute()

const { data: tabs } = await useTabs(props.name, () => props.context)

// The selection lives in local state, seeded from `?tab=`. Changing it must not be a router navigation: that
// re-runs the page and scrolls it to the top. The URL is updated in place with `history.replaceState` instead.
const selected = ref(typeof route.query.tab === 'string' ? route.query.tab : undefined)

// Follow real navigations (back/forward, links carrying `?tab=`).
watch(() => route.query.tab, (tab) => {
  if (typeof tab === 'string') selected.value = tab
})

const active = computed(() => tabs.value?.find(tab => tab.id === selected.value) ?? tabs.value?.[0])

function select(id: string) {
  selected.value = id
  if (!import.meta.client) return
  const url = new URL(window.location.href)
  url.searchParams.set('tab', id)
  window.history.replaceState(window.history.state, '', url)
}

function onKeydown(event: KeyboardEvent, index: number) {
  const list = tabs.value ?? []
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step || !list.length) return
  event.preventDefault()
  const next = list[(index + step + list.length) % list.length]!
  select(next.id)
  nextTick(() => document.getElementById(`tab-${props.name}-${next.id}`)?.focus())
}
</script>

<template>
  <div
    v-if="tabs?.length"
    class="flex flex-col gap-4"
  >
    <div
      role="tablist"
      class="-mx-1 flex overflow-x-auto overflow-y-hidden border-b border-default"
    >
      <button
        v-for="(tab, index) in tabs"
        :id="`tab-${name}-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="tab.id === active?.id"
        :aria-controls="`tabpanel-${name}`"
        :tabindex="tab.id === active?.id ? 0 : -1"
        class="inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary/50"
        :class="tab.id === active?.id ? 'border-primary text-highlighted' : 'border-transparent text-muted hover:text-highlighted'"
        @click="select(tab.id)"
        @keydown="onKeydown($event, index)"
      >
        <UIcon
          v-if="tab.icon"
          :name="tab.icon"
          class="size-5 shrink-0 max-sm:hidden"
        />
        {{ tab.label }}
      </button>
    </div>
    <div
      v-if="active"
      :id="`tabpanel-${name}`"
      role="tabpanel"
      :aria-labelledby="`tab-${name}-${active.id}`"
    >
      <component
        :is="getTabComponent(name, active.id)"
        :key="active.id"
        v-bind="{ ...active.props, ...context }"
        @refresh="emit('refresh')"
      />
    </div>
  </div>
  <slot
    v-else
    name="empty"
  />
</template>
