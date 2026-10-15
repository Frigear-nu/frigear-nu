<script setup lang="ts">
// The row between a list's heading and its table: search and filters in the default slot, counts or view
// switches in `#right`.
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <slot />
    <div
      v-if="$slots.right"
      class="ms-auto flex flex-wrap items-center gap-2"
    >
      <slot name="right" />
    </div>
  </div>
</template>
