<script setup lang="ts">
// Reads the user's settings of this item (stored in their layout) through the frame's context.
const { settings } = useDashboardItem()
</script>

<template>
  <StatCard
    label="Hours worked"
    :value="`item-hours:${settings.range ?? 'month'}`"
  />
</template>
