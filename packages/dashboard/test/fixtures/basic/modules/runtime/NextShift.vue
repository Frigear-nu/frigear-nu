<script setup lang="ts">
defineProps<{ when: string, who?: string }>()
</script>

<template>
  <StatCard
    label="Next shift"
    :value="`item-next-shift:${when}:${who ?? 'nobody'}`"
  />
</template>
