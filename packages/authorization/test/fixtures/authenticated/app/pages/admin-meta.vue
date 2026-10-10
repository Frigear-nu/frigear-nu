<script setup lang="ts">
// Overrides the `/admin/**` rule for this page only - but this one is outside /admin, gated by an ability object.
definePageMeta({ authorize: isAdmin })
</script>

<template>
  <div>admin-meta-page</div>
</template>
