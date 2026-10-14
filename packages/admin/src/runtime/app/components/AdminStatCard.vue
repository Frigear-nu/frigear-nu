<script setup lang="ts">
// Summary tile for widget areas (`admin.*.overview`): same surface and header tokens as `AdminSection`.
// Put the value in the default slot; `empty` is shown instead when there is nothing to display.
defineProps<{ label: string, icon?: string, loading?: boolean, empty?: string }>()
</script>

<template>
  <section class="bg-elevated/50 ring-default flex h-full items-start gap-3 overflow-hidden rounded-lg p-4 ring">
    <span
      v-if="icon"
      class="bg-primary/10 ring-primary/25 text-primary flex shrink-0 items-center justify-center rounded-full p-2.5 ring ring-inset"
    >
      <UIcon
        :name="icon"
        class="size-5"
      />
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <h2 class="text-muted text-xs font-normal uppercase">
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
        class="text-highlighted flex flex-wrap items-center gap-2 text-lg font-semibold"
      >
        <slot />
      </div>
      <p
        v-else
        class="text-muted text-sm"
      >
        {{ empty }}
      </p>
    </div>
  </section>
</template>
