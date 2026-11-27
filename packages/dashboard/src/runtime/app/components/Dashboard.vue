<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { surfaceClass, useConfirmDialog, useModuleT } from '#imports'
import { useDashboard } from '../composables/useDashboard'

/**
 * A named dashboard in the default grid: every item the viewer may see on this platform, in their order. With
 * `editable` (default) the viewer can move, hide and show items and reset the layout. Each item receives its static
 * `props`, then every entry of `context` as a prop. `items` shows only the items with those ids, in that order.
 *
 * The edit mode is `v-model:editing`. With `:edit-button="false"` the page draws its own button to start it (the hub puts
 * it in its heading), reading `canEdit` from the component's ref to know when there is anything to customise.
 */
const props = withDefaults(defineProps<{
  name: string
  context?: Record<string, unknown>
  editable?: boolean
  /** Draws the button that starts editing, a small icon above the grid. Default `true`. */
  editButton?: boolean
  /** Only the items with these ids, in this order. Default: every item. */
  items?: string[]
}>(), { editable: true, editButton: true, items: undefined })

const editing = defineModel<boolean>('editing', { default: false })

/** Whether there is anything to customise: the viewer may edit and the dashboard has items (shown or hidden). */
const canEdit = ref(false)
const start = () => {
  editing.value = true
}
// Exposed before the dashboard loads (`defineExpose` must come before any `await`).
defineExpose({ canEdit, start })

const t = useModuleT('dashboard')
const confirm = useConfirmDialog()
const { items, hidden, status, error, persisted, saving, move, hide, show, reset, refresh } = await useDashboard(props.name, () => props.context, { only: () => props.items })

watchEffect(() => {
  canEdit.value = props.editable && (items.value.length > 0 || hidden.value.length > 0)
})

async function resetLayout() {
  const ok = await confirm({
    title: t('reset.title', 'Reset layout?'),
    description: t('reset.description', 'Restores the default order and shows every hidden item. Collapsed items open again.'),
    confirmText: t('reset.confirm', 'Reset layout'),
    destructive: true,
  })
  if (!ok) return
  await reset()
  editing.value = false
}
</script>

<template>
  <div
    class="flex flex-col gap-4"
    :data-dashboard="name"
  >
    <div
      v-if="canEdit && (editing || editButton)"
      class="flex flex-wrap items-center justify-end gap-2"
    >
      <template v-if="editing">
        <p
          v-if="!persisted"
          class="text-muted me-auto text-sm"
          data-dashboard-session-only
        >
          {{ t('edit.sessionOnly', 'Changes last until you reload the page.') }}
        </p>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-rotate-ccw"
          :label="t('reset.button', 'Reset layout')"
          :disabled="saving"
          @click="resetLayout"
        />
        <UButton
          icon="i-lucide-check"
          :label="t('edit.done', 'Done')"
          @click="editing = false"
        />
      </template>
      <UTooltip
        v-else
        :text="t('edit.start', 'Customise dashboard')"
      >
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-settings-2"
          :aria-label="t('edit.start', 'Customise dashboard')"
          data-dashboard-edit
          @click="start"
        />
      </UTooltip>
    </div>

    <DashboardGrid
      v-if="status === 'pending' && !items.length"
      data-dashboard-pending
    >
      <div
        v-for="index in (props.items?.length || 4)"
        :key="index"
        :class="[surfaceClass, 'space-y-3 p-4']"
      >
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-5 w-2/3" />
      </div>
    </DashboardGrid>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="t('error', 'The dashboard could not be loaded.')"
      :actions="[{ label: t('retry', 'Try again'), color: 'neutral', variant: 'outline', icon: 'i-lucide-rotate-cw', onClick: () => refresh() }]"
    />

    <DashboardGrid v-else-if="items.length">
      <DashboardItem
        v-for="(item, index) in items"
        :key="item.id"
        :item="item"
        :context="context"
        :editing="editing"
        :disabled="saving"
        :first="index === 0"
        :last="index === items.length - 1"
        @move-up="move(item.id, index - 1)"
        @move-down="move(item.id, index + 1)"
        @hide="hide(item.id)"
      />
    </DashboardGrid>

    <slot
      v-else-if="!hidden.length"
      name="empty"
    >
      <UEmpty
        icon="i-lucide-layout-dashboard"
        :title="t('empty.title', 'Nothing here yet')"
        :description="t('empty.description', 'Items appear here when the modules that add them are installed.')"
        variant="naked"
      />
    </slot>

    <EmptyCard
      v-else-if="!editing"
      icon="i-lucide-eye-off"
      :title="t('allHidden.title', 'Every item is hidden')"
      :description="t('allHidden.description', 'Show the items you want to see again.')"
      :action-label="t('edit.start', 'Customise dashboard')"
      @action="start"
    />

    <section
      v-if="editing && hidden.length"
      :class="[surfaceClass, 'flex flex-col']"
      data-dashboard-hidden
    >
      <h2 class="border-default text-highlighted border-b px-4 py-3 text-sm font-semibold">
        {{ t('hidden.title', 'Hidden items') }}
      </h2>
      <ul class="divide-default divide-y">
        <li
          v-for="item in hidden"
          :key="item.id"
          class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
        >
          <span class="truncate">{{ item.title ?? item.id }}</span>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-eye"
            :disabled="saving"
            :label="t('hidden.show', 'Show {title}', { title: item.title ?? item.id })"
            @click="show(item.id)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>
