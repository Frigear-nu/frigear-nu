<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// The thin row between fields (and steps) with a "+" button. With `items` the button opens a menu of field
// types, without it the button just emits `click` (adding a step). `line` shows the drop indicator.
withDefaults(defineProps<{
  items?: DropdownMenuItem[][]
  /** A small round dot instead of a regular button. */
  dot?: boolean
  /** Keeps the button fully visible instead of only on hover. */
  visible?: boolean
  label?: string
  ariaLabel?: string
  line?: boolean
}>(), { items: undefined, label: undefined, ariaLabel: undefined })
const emit = defineEmits<{ click: [], dragover: [event: DragEvent] }>()
</script>

<template>
  <div class="insert-row">
    <UDropdownMenu
      v-if="items"
      :items="items"
      :content="{ align: 'center' }"
    >
      <UButton
        class="insert-button"
        :class="dot ? 'insert-dot' : visible ? 'insert-button-visible' : ''"
        color="neutral"
        variant="soft"
        size="xs"
        icon="i-lucide-plus"
        :aria-label="ariaLabel"
        :label="label"
      />
    </UDropdownMenu>
    <UButton
      v-else
      class="insert-button"
      color="neutral"
      variant="soft"
      size="xs"
      icon="i-lucide-plus"
      :label="label"
      @click="emit('click')"
      @dragover="emit('dragover', $event)"
    />
    <div
      v-if="line"
      class="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-primary"
    />
  </div>
</template>

<style scoped>
.insert-row {
  position: relative;
  display: flex;
  width: 100%;
  height: 1rem;
  align-items: center;
  justify-content: center;
}
.insert-row::before {
  content: '';
  position: absolute;
  inset-inline: 0;
  top: 50%;
  border-top: 1px dashed var(--ui-border-accented);
  opacity: 0;
  transition: opacity 0.15s;
}
.insert-button {
  position: relative;
  opacity: 0.35;
  transition: opacity 0.15s;
}
/* Small round dot that grows a little when pointed at. */
.insert-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 1rem;
  height: 1rem;
  min-width: 0;
  padding: 0;
  gap: 0;
  line-height: 0;
  border-radius: 9999px;
  transition: opacity 0.15s, transform 0.15s;
}
.insert-dot :deep(.iconify) {
  display: block;
  flex: none;
  width: 0.75rem;
  height: 0.75rem;
  margin: 0;
}
/* Touch / small screens: a bigger target that is always clearly visible. */
@media (hover: none), (pointer: coarse), (max-width: 640px) {
  .insert-row { height: 2rem; }
  .insert-dot { width: 1.75rem; height: 1.75rem; opacity: 1; }
  .insert-dot :deep(.iconify) { width: 1rem; height: 1rem; }
  .insert-dot:hover, .insert-dot:focus-visible { transform: scale(1.15); }
}
.insert-dot:hover,
.insert-dot:focus-visible {
  transform: scale(1.6);
}
.insert-row:hover::before,
.insert-row:focus-within::before {
  opacity: 1;
}
.insert-row:hover .insert-button,
.insert-row:focus-within .insert-button,
.insert-button-visible {
  opacity: 1;
}
@media (hover: none) {
  .insert-row::before { opacity: 1; }
  .insert-button { opacity: 1; }
}
</style>
