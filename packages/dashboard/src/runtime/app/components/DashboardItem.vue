<script setup lang="ts">
import { computed, onErrorCaptured, provide, ref } from 'vue'
import { errorMessage, surfaceClass, useModuleT } from '#imports'
import type { DashboardEntry } from '../composables/useDashboard'
import { dashboardItemKey, type DashboardItemContext } from '../composables/useDashboardItem'
import { useDashboardLayout } from '../composables/useDashboardLayout'
import { setItemSettings, toggleCollapsed } from '../../shared/layout'
import { getDashboardComponent } from '../utils/components'
import { dashboardSpanClass } from '../utils/span'

/**
 * The frame of one dashboard item: its title with a collapse toggle, the item's component, a skeleton while the item
 * reports `loading` and an error with a retry. Provides `useDashboardItem()` to the component. In `editing` mode it
 * shows the buttons to move and hide the item (the dashboard handles the events).
 */
const props = defineProps<{
  item: DashboardEntry
  context?: Record<string, unknown>
  editing?: boolean
  first?: boolean
  last?: boolean
}>()

const emit = defineEmits<{
  moveUp: []
  moveDown: []
  hide: []
}>()

const t = useModuleT('dashboard')
const { layout, update } = useDashboardLayout(props.item.dashboard)
const component = computed(() => getDashboardComponent(props.item.dashboard, props.item.id))
const label = computed(() => props.item.title ?? props.item.id)

const loading = ref(false)
const error = ref<unknown>(null)
const renderKey = ref(0)
let refreshHandler: (() => unknown) | undefined

const collapsed = computed(() => layout.value.collapsed.includes(props.item.id))
const itemContext: DashboardItemContext = {
  dashboard: props.item.dashboard,
  id: props.item.id,
  loading,
  error,
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
</script>

<template>
  <div
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
          :disabled="first"
          :aria-label="t('item.moveUp', 'Move {title} up', { title: label })"
          @click="emit('moveUp')"
        />
        <UButton
          icon="i-lucide-arrow-down"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="last"
          :aria-label="t('item.moveDown', 'Move {title} down', { title: label })"
          @click="emit('moveDown')"
        />
        <UButton
          icon="i-lucide-eye-off"
          size="xs"
          color="neutral"
          variant="ghost"
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
        v-if="!error && loading"
        :class="[surfaceClass, 'space-y-3 p-4']"
        data-dashboard-skeleton
      >
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-5 w-2/3" />
        <USkeleton class="h-4 w-1/2" />
      </div>
      <div
        v-show="!error && !loading"
        class="h-full"
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
