<script setup lang="ts">
defineProps<{ label: string, icon: string, value: string, hint?: string }>()
</script>

<template>
  <StatCard
    :label="label"
    :icon="icon"
    :value="value"
    :hint="hint"
    to="/admin"
  />
</template>
