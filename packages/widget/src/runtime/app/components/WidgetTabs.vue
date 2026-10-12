<script setup lang="ts">
import { getTabComponent } from '../utils/tabs'

// Renders every tab registered for `name` as a tab list with the active tab's component below it. The active
// tab is kept in the `?tab=` query parameter. Each tab component receives its static `props`, then every entry
// of `context` as a prop, and may emit `refresh`.
const props = defineProps<{ name: string, context?: Record<string, unknown> }>()
const emit = defineEmits<{ refresh: [] }>()

const route = useRoute()
const router = useRouter()

const { data: tabs } = await useTabs(props.name, () => props.context)

const active = computed(() => {
  const requested = route.query.tab
  return tabs.value?.find(tab => tab.id === requested) ?? tabs.value?.[0]
})

function select(id: string) {
  router.replace({ query: { ...route.query, tab: id } })
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
    class="flex flex-col gap-6"
  >
    <div
      role="tablist"
      class="flex gap-1 overflow-x-auto border-b border-default"
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
        class="-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
        :class="tab.id === active?.id ? 'border-primary text-highlighted' : 'border-transparent text-muted hover:text-default'"
        @click="select(tab.id)"
        @keydown="onKeydown($event, index)"
      >
        <UIcon
          v-if="tab.icon"
          :name="tab.icon"
          class="size-4"
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
