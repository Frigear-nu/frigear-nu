<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  /** Renders a "back" link above the title. */
  backTo?: string
  backLabel?: string
}>()
</script>

<template>
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <UButton
        v-if="backTo"
        :to="backTo"
        :label="backLabel"
        icon="i-lucide-arrow-left"
        variant="link"
        color="neutral"
        size="sm"
        class="-ml-2 mb-1"
      />
      <h1 class="text-2xl font-semibold">
        <slot name="title">
          {{ title }}
        </slot>
      </h1>
      <p
        v-if="description"
        class="text-muted mt-1 text-sm"
      >
        {{ description }}
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="flex flex-wrap items-center gap-2"
    >
      <slot name="actions" />
    </div>
  </header>
</template>
