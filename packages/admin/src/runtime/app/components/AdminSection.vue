<script setup lang="ts">
defineProps<{ title?: string, description?: string, loading?: boolean }>()
</script>

<template>
  <section class="border-default bg-default overflow-hidden rounded-xl border">
    <div
      v-if="title || $slots.header || $slots.actions"
      class="border-default flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5"
    >
      <slot name="header">
        <div class="min-w-0">
          <h2 class="text-highlighted text-sm font-semibold">
            {{ title }}
          </h2>
          <p
            v-if="description"
            class="text-muted text-sm"
          >
            {{ description }}
          </p>
        </div>
      </slot>
      <div
        v-if="$slots.actions"
        class="flex items-center gap-2"
      >
        <slot name="actions" />
      </div>
    </div>
    <div :class="$slots.flush || loading ? '' : 'p-4'">
      <div
        v-if="loading"
        class="space-y-2 p-4"
      >
        <USkeleton class="h-5 w-1/2" />
        <USkeleton class="h-5 w-1/3" />
      </div>
      <template v-else>
        <slot name="flush" />
        <slot />
      </template>
    </div>
    <div
      v-if="$slots.footer"
      class="border-default border-t px-4 py-3"
    >
      <slot name="footer" />
    </div>
  </section>
</template>
