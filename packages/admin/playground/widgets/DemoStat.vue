<script setup lang="ts">
defineProps<{ label: string, icon: string, value: string, hint?: string }>()
</script>

<template>
  <AdminStatCard
    :label="label"
    :icon="icon"
    to="/admin"
  >
    <span>{{ value }}</span>
    <span
      v-if="hint"
      class="text-muted text-sm font-normal"
    >{{ hint }}</span>
  </AdminStatCard>
</template>
