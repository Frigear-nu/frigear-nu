<script setup lang="ts">
import { surfaceClass } from '#imports'

/**
 * A frame for a chart: title, optional description and `#actions`, a skeleton while `loading`, `empty` when `isEmpty`.
 * The chart itself goes in the default slot (no chart library is bundled).
 */
defineProps<{
  title: string
  description?: string
  loading?: boolean
  isEmpty?: boolean
  empty?: string
}>()
</script>

<template>
  <section :class="[surfaceClass, 'flex h-full flex-col']">
    <div class="border-default flex items-center justify-between gap-3 border-b px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-highlighted text-sm font-semibold">
          {{ title }}
        </h2>
        <p
          v-if="description"
          class="text-muted text-xs"
        >
          {{ description }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="flex items-center gap-2"
      >
        <slot name="actions" />
      </div>
    </div>
    <div class="flex-1 p-4">
      <div
        v-if="loading"
        class="flex h-40 items-end gap-2"
      >
        <USkeleton class="h-1/3 flex-1" />
        <USkeleton class="h-2/3 flex-1" />
        <USkeleton class="h-1/2 flex-1" />
        <USkeleton class="h-full flex-1" />
        <USkeleton class="h-3/5 flex-1" />
      </div>
      <p
        v-else-if="isEmpty"
        class="text-muted py-6 text-center text-sm"
      >
        {{ empty }}
      </p>
      <slot v-else />
    </div>
  </section>
</template>
