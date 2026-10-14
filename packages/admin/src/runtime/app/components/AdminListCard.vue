<script setup lang="ts">
// Card for a short list on the dashboard (`admin.dashboard`, `admin.dashboard.side`): title, optional description,
// rows in the default slot (put `<li>`s inside, they get dividers), a "view all" link in the footer. `empty` shows
// instead of the rows when `isEmpty` is set.
defineProps<{
  title: string
  description?: string
  loading?: boolean
  isEmpty?: boolean
  empty?: string
  to?: string
  toLabel?: string
}>()
</script>

<template>
  <section class="bg-elevated/50 ring-default flex h-full flex-col overflow-hidden rounded-lg ring">
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
    <div class="flex-1 px-4">
      <div
        v-if="loading"
        class="space-y-3 py-4"
      >
        <USkeleton class="h-4 w-2/3" />
        <USkeleton class="h-4 w-1/2" />
        <USkeleton class="h-4 w-3/5" />
      </div>
      <p
        v-else-if="isEmpty"
        class="text-muted py-6 text-center text-sm"
      >
        {{ empty }}
      </p>
      <ul
        v-else
        class="divide-default divide-y text-sm [&>li]:py-2.5"
      >
        <slot />
      </ul>
    </div>
    <div
      v-if="to"
      class="border-default border-t px-4 py-2.5"
    >
      <UButton
        :to="to"
        variant="link"
        color="neutral"
        size="xs"
        class="p-0"
        trailing-icon="i-lucide-arrow-right"
        :label="toLabel"
      />
    </div>
  </section>
</template>
