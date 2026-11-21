<script setup lang="ts">
// The host's own contact component: what `contactComponent` names. It gets the card's `contact` label and `initial`.
defineProps<{ label?: string, initial?: Record<string, unknown> }>()
</script>

<template>
  <button
    type="button"
    data-test="test-contact"
  >
    Contact: {{ label }} {{ JSON.stringify(initial ?? {}) }}
  </button>
</template>
