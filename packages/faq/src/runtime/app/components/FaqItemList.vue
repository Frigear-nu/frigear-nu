<script setup lang="ts">
import type { StaffFaqGroup, StaffFaqItem } from '../utils/admin-faq'
import { faqApi } from '../../utils/api'
import { moveId } from '../../utils/reorder'
import { $fetch, ref, useAction, useFaqItemActions, useFaqTranslate, useModuleT, watch } from '#imports'

defineOptions({ name: 'FaqItemList' })

// The items of a group as a sortable list: a drag handle (native drag and drop) and up/down buttons for the keyboard.
// Moving an item saves the whole order through `POST .../reorder` and shows it at once; a refused order puts the list back.
const props = defineProps<{ group: StaffFaqGroup, items: StaffFaqItem[] }>()
const emit = defineEmits<{ changed: [] }>()

const t = useModuleT('faq')
const tr = useFaqTranslate()
const actions = useFaqItemActions()
const { busy, run } = useAction()

const ordered = ref<StaffFaqItem[]>([...props.items])
watch(() => props.items, items => ordered.value = [...items])

async function applyOrder(next: string[]) {
  const previous = ordered.value
  const byId = new Map(previous.map(item => [item.id, item]))
  ordered.value = next.map(id => byId.get(id)!)
  const saved = await run(
    () => $fetch(faqApi.admin.reorder(props.group.id), { method: 'POST', body: { itemIds: next } }).then(() => true),
    { error: t('admin.reorderFailed', 'Could not save the new order') },
  )
  if (saved) emit('changed')
  else ordered.value = previous
}

const move = (from: number, to: number) => applyOrder(moveId(ordered.value.map(item => item.id), from, to))

// Native drag and drop: the dragged row's index travels in the component, dropping on a row puts it there.
const dragging = ref<number | null>(null)
const over = ref<number | null>(null)

function drop(to: number) {
  const from = dragging.value
  dragging.value = null
  over.value = null
  if (from !== null && from !== to) void move(from, to)
}

function visibilityLabel(item: StaffFaqItem) {
  if (!item.visibility) return t('admin.visibilityInherited', 'Same as the group')
  return item.visibility.public ? t('admin.visibility.public', 'Public') : t('admin.visibilityRestricted', 'Restricted')
}
</script>

<template>
  <ul
    class="divide-default divide-y"
    data-test="faq-items"
  >
    <li
      v-for="(item, index) in ordered"
      :key="item.id"
      class="flex items-center gap-3 px-4 py-3 transition-colors"
      :class="{ 'bg-elevated': over === index && dragging !== index, 'opacity-50': dragging === index }"
      draggable="true"
      data-test="faq-item"
      @dragstart="dragging = index"
      @dragend="dragging = null; over = null"
      @dragover.prevent="over = index"
      @drop.prevent="drop(index)"
    >
      <UIcon
        name="i-lucide-grip-vertical"
        class="text-muted size-4 shrink-0 cursor-grab"
        :aria-label="t('admin.dragToReorder', 'Drag to reorder')"
      />
      <div class="min-w-0 flex-1">
        <div class="text-highlighted truncate text-sm font-medium">
          {{ tr(item.question) }}
        </div>
        <div class="text-muted truncate text-xs">
          {{ visibilityLabel(item) }}
        </div>
      </div>
      <StatusBadge
        :status="item.status"
        :label="item.status === 'published' ? t('admin.statuses.published', 'Published') : t('admin.statuses.draft', 'Draft')"
      />
      <div class="flex shrink-0 items-center gap-1">
        <UButton
          icon="i-lucide-chevron-up"
          variant="ghost"
          color="neutral"
          size="xs"
          :disabled="index === 0 || busy"
          :aria-label="t('admin.moveUp', 'Move up')"
          @click="move(index, index - 1)"
        />
        <UButton
          icon="i-lucide-chevron-down"
          variant="ghost"
          color="neutral"
          size="xs"
          :disabled="index === ordered.length - 1 || busy"
          :aria-label="t('admin.moveDown', 'Move down')"
          @click="move(index, index + 1)"
        />
        <RowMenu
          :items="actions.menu(group, item, { onChanged: () => emit('changed') })"
          :subject="tr(item.question)"
        />
      </div>
    </li>
  </ul>
</template>
