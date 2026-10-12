<script setup lang="ts">
defineProps<{ who?: string }>()
</script>

<template>
  <p>tab-first:{{ who }}</p>
</template>
