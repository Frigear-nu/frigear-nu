<script setup lang="ts">
import type { FormField } from '../../../types'
import { fieldTypeIcons, useFormBuilderLabels } from '../composables/useFormBuilderLabels'

// One field on the builder canvas: draggable, selectable, with move/duplicate/delete actions on hover.
defineProps<{
  field: FormField
  selected: boolean
  dragging: boolean
}>()
const emit = defineEmits<{
  select: []
  dragstart: [event: DragEvent]
  dragend: []
  dragover: [event: DragEvent]
  up: []
  down: []
  duplicate: []
  remove: []
}>()

const t = useModuleT('forms')
const { typeLabel, summary } = useFormBuilderLabels()
</script>

<template>
  <div
    draggable="true"
    class="group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 hover:bg-elevated"
    :class="[
      selected ? 'border-primary bg-elevated' : 'border-default',
      dragging ? 'opacity-40' : '',
    ]"
    @click="emit('select')"
    @dragstart.stop="emit('dragstart', $event)"
    @dragend="emit('dragend')"
    @dragover="emit('dragover', $event)"
  >
    <UIcon
      name="i-lucide-grip-vertical"
      class="size-4 shrink-0 cursor-grab text-muted"
    />
    <UIcon
      :name="fieldTypeIcons[field.type]"
      class="size-4 shrink-0 text-muted"
    />
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium">
        {{ summary(field) }}<span
          v-if="field.required"
          class="text-error"
        > *</span>
      </p>
      <p class="truncate text-xs text-muted">
        {{ typeLabel(field.type) }} · {{ field.key }}
      </p>
    </div>
    <UBadge
      v-if="field.showIf"
      color="neutral"
      variant="subtle"
      size="sm"
      :label="t('builder.conditionalBadge', 'Conditional')"
    />
    <div class="flex shrink-0 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-chevron-up"
        :aria-label="t('builder.moveUp', 'Move up')"
        @click.stop="emit('up')"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-chevron-down"
        :aria-label="t('builder.moveDown', 'Move down')"
        @click.stop="emit('down')"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-copy"
        :aria-label="t('builder.duplicate', 'Duplicate')"
        @click.stop="emit('duplicate')"
      />
      <UButton
        color="error"
        variant="ghost"
        size="xs"
        icon="i-lucide-trash-2"
        :aria-label="t('builder.delete', 'Delete')"
        @click.stop="emit('remove')"
      />
    </div>
  </div>
</template>
