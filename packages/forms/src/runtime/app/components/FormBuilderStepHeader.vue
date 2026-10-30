<script setup lang="ts">
import type { FormStep } from '../../../types'
import { translate } from '../../utils'
import { useFormsLocale } from '../composables/useForms'
import { useModuleT } from '#imports'

// The header of a step on the builder canvas: drag handle, title and move/delete actions.
defineProps<{
  step: FormStep
  /** Zero-based position; shown one-based. */
  index: number
  isFirst: boolean
  isLast: boolean
  /** The only step cannot be deleted. */
  isOnly: boolean
}>()
const emit = defineEmits<{
  select: []
  dragstart: [event: DragEvent]
  dragend: []
  up: []
  down: []
  remove: []
}>()

const t = useModuleT('forms')
const locale = useFormsLocale()
</script>

<template>
  <header
    class="flex cursor-pointer items-center gap-2 border-b border-default px-3 py-2"
    @click="emit('select')"
  >
    <span
      draggable="true"
      class="cursor-grab text-muted active:cursor-grabbing"
      :title="t('builder.dragStep', 'Drag to reorder steps')"
      @dragstart.stop="emit('dragstart', $event)"
      @dragend="emit('dragend')"
    >
      <UIcon
        name="i-lucide-grip-vertical"
        class="size-4"
      />
    </span>
    <span class="flex-1 truncate text-sm font-semibold">
      {{ index + 1 }}. {{ translate(step.title, locale) || step.id }}
    </span>
    <UBadge
      v-if="step.showIf"
      color="neutral"
      variant="subtle"
      size="sm"
      :label="t('builder.conditionalBadge', 'Conditional')"
    />
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-chevron-up"
      :disabled="isFirst"
      :aria-label="t('builder.moveUp', 'Move up')"
      @click.stop="emit('up')"
    />
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-chevron-down"
      :disabled="isLast"
      :aria-label="t('builder.moveDown', 'Move down')"
      @click.stop="emit('down')"
    />
    <UButton
      color="error"
      variant="ghost"
      size="xs"
      icon="i-lucide-trash-2"
      :disabled="isOnly"
      :aria-label="t('builder.deleteStep', 'Delete step')"
      @click.stop="emit('remove')"
    />
  </header>
</template>
