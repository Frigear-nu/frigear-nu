<script setup lang="ts">
// Resolved by name, like MDC does for `::form-embed{slug="..."}`.
const route = useRoute()
</script>

<template>
  <main>
    <p>before</p>
    <component
      :is="resolveComponent('FormEmbed')"
      :slug="String(route.query.slug)"
      :title="route.query.title === '1'"
    />
    <p>after</p>
  </main>
</template>
