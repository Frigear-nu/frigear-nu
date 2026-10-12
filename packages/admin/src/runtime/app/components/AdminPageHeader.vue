<script setup lang="ts">
// The one heading every `/admin/*` page uses: a Nuxt UI `UPageHeader` with a consistent size and spacing.
// `back` renders a small link above the title (for detail pages); actions go in the `links` slot
// (`actions` is accepted as an alias), extra content (badges, metadata) in the default slot.
defineProps<{
  title?: string
  description?: string
  back?: { label: string, to: string }
}>()
</script>

<template>
  <UPageHeader
    :title="title"
    :description="description"
    :ui="{ root: 'mb-6', title: 'text-2xl sm:text-3xl' }"
  >
    <template
      v-if="back || $slots.headline"
      #headline
    >
      <slot name="headline">
        <UButton
          v-if="back"
          class="p-0"
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-arrow-left"
          :to="back.to"
          :label="back.label"
        />
      </slot>
    </template>

    <template
      v-if="$slots.title"
      #title
    >
      <slot name="title" />
    </template>

    <template
      v-if="$slots.description"
      #description
    >
      <slot name="description" />
    </template>

    <template
      v-if="$slots.links || $slots.actions"
      #links
    >
      <slot name="links">
        <slot name="actions" />
      </slot>
    </template>

    <slot />
  </UPageHeader>
</template>
