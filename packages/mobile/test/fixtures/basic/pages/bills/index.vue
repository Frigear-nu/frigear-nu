<script setup lang="ts">
const count = ref(2)
useMobileNavbarActions(() => [{ id: 'add', label: `Add bill (${count.value})`, onSelect: () => count.value++ }])
</script>

<template>
  <p>bills-page</p>
</template>
