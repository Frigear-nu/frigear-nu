<script setup lang="ts">
defineProps<{ title?: string, description?: string }>()
</script>

<template>
  <section class="border-default overflow-hidden rounded-lg border">
    <div
      v-if="title || $slots.header || $slots.actions"
      class="border-default flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
    >
      <slot name="header">
        <div class="min-w-0">
          <h2 class="text-sm font-semibold">
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
    <div :class="$slots.flush ? '' : 'p-4'">
      <slot name="flush" />
      <slot />
    </div>
    <div
      v-if="$slots.footer"
      class="border-default border-t px-4 py-3"
    >
      <slot name="footer" />
    </div>
  </section>
</template>
