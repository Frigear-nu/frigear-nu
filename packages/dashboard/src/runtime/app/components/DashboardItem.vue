<script setup lang="ts">
import { computed, onBeforeUnmount, onErrorCaptured, provide, ref, watch } from 'vue'
import { errorMessage, surfaceClass, useModuleT } from '#imports'
import type { DashboardEntry } from '../composables/useDashboard'
import { dashboardItemKey, type DashboardItemContext } from '../composables/useDashboardItem'
import { useDashboardLayout } from '../composables/useDashboardLayout'
import { setItemSettings, toggleCollapsed } from '../../shared/layout'
import { getDashboardComponent } from '../utils/components'
import { dashboardSpanClass } from '../utils/span'

/**
 * The frame of one dashboard item: its title with a collapse toggle, the item's component, a skeleton while the item
 * reports `loading`, an error with a retry, and nothing while it reports `empty` or renders nothing at all (a `v-if` on
 * its root, as widgets shared with other widget areas do). An `optional` item stays out of the grid, with no title or
 * skeleton, until it has shown content once, so an item with nothing for this viewer never flashes. Provides
 * `useDashboardItem()` to the component. In `editing` mode it shows the buttons to move and hide the item (the dashboard
 * handles the events).
 */
const props = defineProps<{
  item: DashboardEntry
  context?: Record<string, unknown>
  editing?: boolean
  /** Disables the edit buttons, while a layout change is being saved. */
  disabled?: boolean
  first?: boolean
  last?: boolean
}>()

const emit = defineEmits<{
  moveUp: []
  moveDown: []
  hide: []
}>()

const t = useModuleT('dashboard')
const { layout, saving, update } = useDashboardLayout(props.item.dashboard)
const component = computed(() => getDashboardComponent(props.item.dashboard, props.item.id))
const label = computed(() => props.item.title ?? props.item.id)

const loading = ref(false)
const error = ref<unknown>(null)
const empty = ref(false)
const renderKey = ref(0)
let refreshHandler: (() => unknown) | undefined

const collapsed = computed(() => layout.value.collapsed.includes(props.item.id))
const itemContext: DashboardItemContext = {
  dashboard: props.item.dashboard,
  id: props.item.id,
  loading,
  error,
  empty,
  collapsed,
  settings: computed(() => layout.value.settings?.[props.item.id] ?? {}),
  setSettings: value => update(current => setItemSettings(current, props.item.id, value)),
  async refresh() {
    error.value = null
    // An item that registered nothing (or failed while rendering) is mounted again.
    if (refreshHandler) await refreshHandler()
    else renderKey.value++
  },
  onRefresh(handler) {
    refreshHandler = handler
  },
}
provide(dashboardItemKey, itemContext)

// An item that throws while rendering shows its own error state instead of breaking the dashboard.
onErrorCaptured((cause) => {
  error.value = cause
  return false
})

const toggle = () => update(current => toggleCollapsed(current, props.item.id))

// Whether the component currently renders nothing (only comment or blank text nodes), watched as it changes. Kept while
// the item is collapsed, so collapsing never makes a hidden item appear. An `optional` item counts as blank until it is
// checked, so the server and the first client render leave it out (a collapsed one renders no content to check).
const blank = ref(!!props.item.optional && !collapsed.value)
const content = ref<HTMLElement | null>(null)
let observer: MutationObserver | undefined
const check = () => {
  if (content.value) blank.value = content.value.childElementCount === 0 && !content.value.textContent?.trim()
}
watch(content, (element) => {
  observer?.disconnect()
  if (!element || typeof MutationObserver === 'undefined') return
  check()
  observer = new MutationObserver(check)
  observer.observe(element, { childList: true, subtree: true, characterData: true })
}, { flush: 'post' })
onBeforeUnmount(() => observer?.disconnect())

// Whether the item has been in the grid: from then on it shows a skeleton while it reloads. An `optional` item starts
// unsettled, hidden while it loads, until it has something to show.
const settled = ref(!props.item.optional)
const visible = computed(() => props.editing || !!error.value || (!empty.value && (settled.value ? loading.value || !blank.value : !loading.value && !blank.value)))
watch(() => visible.value && !props.editing, (shown) => {
  if (shown) settled.value = true
}, { immediate: true })
</script>

<template>
  <!-- An item with nothing to show (`empty`, or nothing rendered) stays mounted, so it can come back, but takes no place in
       the grid. -->
  <div
    v-show="visible"
    :class="['flex min-w-0 flex-col gap-2', dashboardSpanClass(item.span)]"
    :data-dashboard-item="item.id"
  >
    <div
      v-if="item.title || editing"
      class="flex min-h-7 items-center justify-between gap-2"
    >
      <button
        v-if="item.title"
        type="button"
        class="text-highlighted flex min-w-0 items-center gap-1 text-sm font-semibold"
        :aria-expanded="!collapsed"
        :disabled="saving"
        :aria-label="collapsed ? t('item.expand', 'Expand {title}', { title: label }) : t('item.collapse', 'Collapse {title}', { title: label })"
        @click="toggle"
      >
        <UIcon
          :name="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
          class="text-muted size-4 shrink-0"
        />
        <span class="truncate">{{ item.title }}</span>
      </button>
      <span v-else />
      <div
        v-if="editing"
        class="flex shrink-0 items-center gap-1"
      >
        <UButton
          icon="i-lucide-arrow-up"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="first || disabled"
          :aria-label="t('item.moveUp', 'Move {title} up', { title: label })"
          @click="emit('moveUp')"
        />
        <UButton
          icon="i-lucide-arrow-down"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="last || disabled"
          :aria-label="t('item.moveDown', 'Move {title} down', { title: label })"
          @click="emit('moveDown')"
        />
        <UButton
          icon="i-lucide-eye-off"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="disabled"
          :aria-label="t('item.hide', 'Hide {title}', { title: label })"
          @click="emit('hide')"
        />
      </div>
    </div>

    <template v-if="!collapsed">
      <div
        v-if="error"
        :class="[surfaceClass, 'flex flex-col items-start gap-2 p-4']"
        role="alert"
      >
        <p class="text-highlighted text-sm font-medium">
          {{ t('item.error', '{title} could not be loaded.', { title: label }) }}
        </p>
        <p class="text-muted text-xs">
          {{ errorMessage(error, t('item.errorHint', 'Something went wrong. Try again in a moment.')) }}
        </p>
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-rotate-cw"
          :label="t('item.retry', 'Try again')"
          @click="itemContext.refresh()"
        />
      </div>
      <div
        v-if="!error && loading && (settled || editing)"
        :class="[surfaceClass, 'space-y-3 p-4']"
        data-dashboard-skeleton
      >
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-5 w-2/3" />
        <USkeleton class="h-4 w-1/2" />
      </div>
      <!-- Grows to the row's height, and so does the component's root, so cards in a row line up. -->
      <div
        v-show="!error && !loading"
        ref="content"
        class="flex min-h-0 flex-1 flex-col *:flex-1"
      >
        <component
          :is="component"
          :key="renderKey"
          v-bind="{ ...item.props, ...context }"
        />
      </div>
    </template>
  </div>
</template>
