<script setup lang="ts">
import type { StaffHelpArticle, StaffHelpCategory } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { moveId } from '../../utils/faq'
import { $fetch, ref, useAction, useHelpCenterTranslate, useModuleT, watch } from '#imports'

defineOptions({ name: 'HelpCategoryArticleOrder' })

// The articles of a category as a sortable list: a drag handle (native drag and drop) and up/down buttons for the
// keyboard. Moving an article saves the whole order through `POST .../reorder` and shows it at once; a refused order
// puts the list back.
const props = defineProps<{ category: StaffHelpCategory, articles: StaffHelpArticle[] }>()
const emit = defineEmits<{ changed: [] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const { busy, run } = useAction()

const ordered = ref<StaffHelpArticle[]>([...props.articles])
watch(() => props.articles, articles => ordered.value = [...articles])

async function applyOrder(next: string[]) {
  const previous = ordered.value
  const byId = new Map(previous.map(article => [article.id, article]))
  ordered.value = next.map(id => byId.get(id)!)
  const saved = await run(
    () => $fetch(helpCenterApi.admin.reorder(props.category.id), { method: 'POST', body: { articleIds: next } }).then(() => true),
    { error: t('admin.reorderFailed', 'Could not save the new order') },
  )
  if (saved) emit('changed')
  else ordered.value = previous
}

const move = (from: number, to: number) => applyOrder(moveId(ordered.value.map(article => article.id), from, to))

// Native drag and drop: the dragged row's index travels in the component, dropping on a row puts it there.
const dragging = ref<number | null>(null)
const over = ref<number | null>(null)

function drop(to: number) {
  const from = dragging.value
  dragging.value = null
  over.value = null
  if (from !== null && from !== to) void move(from, to)
}
</script>

<template>
  <ul
    class="divide-default divide-y"
    data-test="help-category-article-order"
  >
    <li
      v-for="(article, index) in ordered"
      :key="article.id"
      class="flex items-center gap-3 px-1 py-3 transition-colors"
      :class="{ 'bg-elevated': over === index && dragging !== index, 'opacity-50': dragging === index }"
      draggable="true"
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
          {{ tr(article.title) }}
        </div>
        <div class="text-muted truncate text-xs">
          {{ article.slug }}
        </div>
      </div>
      <StatusBadge
        :status="article.status"
        :label="article.status === 'published' ? t('admin.statusPublished', 'Published') : t('admin.statusDraft', 'Draft')"
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
      </div>
    </li>
  </ul>
</template>
