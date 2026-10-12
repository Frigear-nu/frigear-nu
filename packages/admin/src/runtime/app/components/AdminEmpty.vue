<script setup lang="ts">
defineProps<{ icon?: string, title: string, description?: string }>()
</script>

<template>
  <UEmpty
    :icon="icon"
    :title="title"
    :description="description"
    variant="naked"
    class="py-10"
  >
    <template
      v-if="$slots.default"
      #actions
    >
      <slot />
    </template>
  </UEmpty>
</template>
