<script setup lang="ts">
import { surfaceClass } from '../../utils/surface'

/**
 * The surface a list table sits in: `<TableCard><UTable :ui="tableUi()" … /></TableCard>`. `#header` sits above
 * the table (filters, a title), `#footer` below it (total, pagination). A surface only, so the table keeps its
 * typed slots.
 */
defineProps<{
  /** Shows skeleton rows instead of the default slot. */
  loading?: boolean
}>()
</script>

<template>
  <div :class="surfaceClass">
    <div
      v-if="$slots.header"
      class="border-default flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
    >
      <slot name="header" />
    </div>
    <div
      v-if="loading"
      class="space-y-3 p-4"
    >
      <USkeleton class="h-5 w-full" />
      <USkeleton class="h-5 w-5/6" />
      <USkeleton class="h-5 w-2/3" />
    </div>
    <slot v-else />
    <div
      v-if="$slots.footer"
      class="border-default text-muted flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
