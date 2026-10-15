<script setup lang="ts">
import { surfaceClass } from '../../utils/surface'

/**
 * The surface a list table sits in: `<TableCard><UTable :ui="tableUi()" … /></TableCard>`. `#header` sits above
 * the table (filters, a title), `#footer` below it (`TablePagination`). A surface only, so the table keeps its
 * typed slots.
 *
 * `loading` is the first load (skeleton rows, nothing to show yet); `refreshing` is every load after that: the
 * current rows stay and are dimmed until the next ones arrive, so paging, sorting and filtering do not flash.
 */
defineProps<{
  /** Shows skeleton rows instead of the default slot. */
  loading?: boolean
  /** Dims the rows on screen while new ones load. */
  refreshing?: boolean
}>()
</script>

<template>
  <div
    :class="surfaceClass"
    :aria-busy="loading || refreshing ? 'true' : undefined"
  >
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
    <div
      v-else
      class="relative"
    >
      <slot />
      <div
        class="bg-default/50 pointer-events-none absolute inset-0 transition-opacity duration-150 motion-reduce:transition-none"
        :class="refreshing ? 'opacity-100' : 'opacity-0'"
        aria-hidden="true"
      />
    </div>
    <div
      v-if="$slots.footer"
      class="border-default text-muted flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
