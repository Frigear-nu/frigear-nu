<script setup lang="ts">
// The page a first aid module ships for its maps: `<MapView>` on the map's key is all it takes.
const route = useRoute()
</script>

<template>
  <MapView :map="String(route.params.map)" />
</template>
