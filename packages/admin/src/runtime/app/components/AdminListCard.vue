<!-- @deprecated: use ListCard from @frigear-nu/ui -->
<script setup lang="ts">
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
  <ListCard
    :title="title"
    :description="description"
    :loading="loading"
    :is-empty="isEmpty"
    :empty="empty"
    :to="to"
    :to-label="toLabel"
  >
    <template
      v-if="$slots.actions"
      #actions
    >
      <slot name="actions" />
    </template>
    <slot />
  </ListCard>
</template>
