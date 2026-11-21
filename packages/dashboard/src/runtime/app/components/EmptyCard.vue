<script setup lang="ts">
import { computed } from 'vue'
import { surfaceClass } from '#imports'

/**
 * An empty state in a card (`UEmpty`) with exactly one action: a link to `to` or the `action` event. Without
 * `actionLabel` it has none, for a state the viewer cannot change.
 */
const props = defineProps<{
  title: string
  description?: string
  icon?: string
  actionLabel?: string
  to?: string
}>()

const emit = defineEmits<{ action: [] }>()

const actions = computed(() => props.actionLabel
  ? [{ label: props.actionLabel, to: props.to, color: 'neutral' as const, variant: 'outline' as const, onClick: () => emit('action') }]
  : undefined)
</script>

<template>
  <div :class="[surfaceClass, 'h-full']">
    <UEmpty
      :icon="icon"
      :title="title"
      :description="description"
      :actions="actions"
      variant="naked"
    />
  </div>
</template>
