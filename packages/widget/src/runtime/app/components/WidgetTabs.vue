<script setup lang="ts">
import { getTabComponent } from '../utils/tabs'
import { computed, nextTick, useRoute, useRouter, useTabs } from '#imports'

// Renders every tab registered for `name` as a tab list with the active tab's component below it. The active
// tab is kept in the `?tab=` query parameter (the first tab, the default, leaves it out). Each tab component receives its static `props`, then every entry
// of `context` as a prop, and may emit `refresh`.
const props = defineProps<{ name: string, context?: Record<string, unknown> }>()
const emit = defineEmits<{ refresh: [] }>()

const route = useRoute()
const router = useRouter()

const { data: tabs } = await useTabs(props.name, () => props.context)

// The selection is the route's `?tab=`, changed with `router.replace`: the router then records it in the history
// entry, so Back from a page opened in a tab returns to that tab. (A bare `history.replaceState` does not: the
// router re-saves the entry from its own state on the next push and drops `?tab=`.) A query-only replace keeps the
// page mounted and does not scroll.
const active = computed(() => tabs.value?.find(tab => tab.id === route.query.tab) ?? tabs.value?.[0])

function select(id: string) {
  if (id === active.value?.id) return
  // The first tab is the default: the URL without `?tab=` opens it, so it stays out of the query.
  const { tab: _tab, ...query } = route.query
  router.replace({ path: route.path, hash: route.hash, query: id === tabs.value?.[0]?.id ? query : { ...query, tab: id } })
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
      <!-- A boundary per tab: the tab's chunk and its awaited data load behind a skeleton instead of leaving the
           panel blank. On the server it resolves, so `?tab=` renders the tab itself. -->
      <Suspense :key="active.id">
        <component
          :is="getTabComponent(name, active.id)"
          v-bind="{ ...active.props, ...context }"
          @refresh="emit('refresh')"
        />
        <template #fallback>
          <slot
            name="loading"
            :tab="active"
          >
            <div
              aria-busy="true"
              class="overflow-hidden rounded-lg border border-default"
            >
              <div class="border-b border-default px-4 py-3.5">
                <USkeleton class="h-5 w-40" />
              </div>
              <div class="space-y-3 p-4">
                <USkeleton class="h-5 w-full" />
                <USkeleton class="h-5 w-5/6" />
                <USkeleton class="h-5 w-2/3" />
                <USkeleton class="h-5 w-3/4" />
              </div>
            </div>
          </slot>
        </template>
      </Suspense>
    </div>
  </div>
  <slot
    v-else
    name="empty"
  />
</template>
