<script setup lang="ts">
</script>

<template>
  <div>
    <AppHeader v-if="$route.meta.header !== false" />
    <UMain>
      <slot />
    </UMain>
    <AppFooter v-if="$route.meta.footer !== false" />
  </div>
</template>
