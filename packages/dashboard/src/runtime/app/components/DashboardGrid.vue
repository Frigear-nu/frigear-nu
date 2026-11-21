<script setup lang="ts">
// The dashboard grid: one column on phones, two from `md`, four from `xl`. Children span columns with
// `dashboardSpanClass(span)` (`DashboardItem` does this from the item's `span`).
</script>

<template>
  <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
    <slot />
  </div>
</template>
