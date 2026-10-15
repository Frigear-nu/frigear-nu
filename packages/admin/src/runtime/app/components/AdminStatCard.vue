<!-- @deprecated: use StatCard from @frigear-nu/ui -->
<script setup lang="ts">
defineProps<{ label: string, icon?: string, to?: string, loading?: boolean, empty?: string }>()
</script>

<template>
  <StatCard
    :label="label"
    :icon="icon"
    :to="to"
    :loading="loading"
    :empty="empty"
  >
    <template
      v-if="$slots.default"
      #default
    >
      <slot />
    </template>
  </StatCard>
</template>
