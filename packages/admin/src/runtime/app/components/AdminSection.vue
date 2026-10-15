<!-- @deprecated: use SectionCard from @frigear-nu/ui (the `#flush` slot becomes the `flush` prop) -->
<script setup lang="ts">
defineProps<{ title?: string, description?: string, loading?: boolean }>()
</script>

<template>
  <SectionCard
    :title="title"
    :description="description"
    :loading="loading"
    :flush="!!$slots.flush"
  >
    <template
      v-if="$slots.header"
      #header
    >
      <slot name="header" />
    </template>
    <template
      v-if="$slots.actions"
      #actions
    >
      <slot name="actions" />
    </template>
    <slot name="flush" />
    <slot />
    <template
      v-if="$slots.footer"
      #footer
    >
      <slot name="footer" />
    </template>
  </SectionCard>
</template>
