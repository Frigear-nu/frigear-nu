<script setup lang="ts">
// The one heading every `/admin/*` page uses: compact title row with a muted description, actions on the right.
// `back` renders a small link above the title (for detail pages); actions go in the `links` slot
// (`actions` is accepted as an alias), extra content (badges, metadata) in the default slot.
defineProps<{
  title?: string
  description?: string
  back?: { label: string, to: string }
}>()
</script>

<template>
  <header class="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div class="min-w-0 space-y-1">
      <slot name="headline">
        <UButton
          v-if="back"
          class="-ml-1 p-1"
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-arrow-left"
          :to="back.to"
          :label="back.label"
        />
      </slot>
      <h1 class="text-highlighted text-xl font-semibold tracking-tight text-pretty sm:text-2xl">
        <slot name="title">
          {{ title }}
        </slot>
      </h1>
      <p
        v-if="description || $slots.description"
        class="text-muted text-sm text-pretty"
      >
        <slot name="description">
          {{ description }}
        </slot>
      </p>
      <slot />
    </div>
    <div
      v-if="$slots.links || $slots.actions"
      class="flex flex-wrap items-center gap-2"
    >
      <slot name="links">
        <slot name="actions" />
      </slot>
    </div>
  </header>
</template>
