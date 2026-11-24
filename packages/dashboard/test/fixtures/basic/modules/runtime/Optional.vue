<script setup lang="ts">
// An item that may have nothing for the viewer: renders its marker, or nothing at all.
defineProps<{ marker?: string }>()
</script>

<template>
  <p v-if="marker">
    {{ marker }}
  </p>
</template>
