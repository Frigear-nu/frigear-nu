<script setup lang="ts">
// The dashboard grid, sized by the width it gets rather than the screen (a container query), so it fits beside a side
// nav as well as full width: one column below 42rem, two from 42rem, four from 56rem. Items in a row share its height.
// Children span columns with `dashboardSpanClass(span)` (`DashboardItem` does this from the item's `span`).
</script>

<template>
  <div class="@container">
    <div class="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-4">
      <slot />
    </div>
  </div>
</template>
