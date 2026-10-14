<script setup lang="ts">
// Summary tile for widget areas (`admin.*.overview`): same border and header tokens as `AdminSection`.
// Put the value in the default slot; `empty` is shown instead when there is nothing to display.
defineProps<{ label: string, loading?: boolean, empty?: string }>()
</script>

<template>
  <section class="border-default bg-default flex h-full flex-col gap-2 overflow-hidden rounded-xl border p-4">
    <h2 class="text-muted text-sm">
      {{ label }}
    </h2>
    <div
      v-if="loading"
      class="space-y-2"
    >
      <USkeleton class="h-5 w-2/3" />
      <USkeleton class="h-4 w-1/3" />
    </div>
    <div
      v-else-if="$slots.default"
      class="flex flex-wrap items-center gap-2 text-sm"
    >
      <slot />
    </div>
    <p
      v-else
      class="text-muted text-sm"
    >
      {{ empty }}
    </p>
  </section>
</template>
