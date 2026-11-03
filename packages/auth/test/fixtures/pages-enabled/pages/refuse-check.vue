<script setup lang="ts">
// A 401 from the app while signed in: `$api` ends the session and goes to the login page.
const { $api } = useNuxtApp()
await useAsyncData('refuse-check', () => $api('/api/test/refuse').catch(() => null))
</script>

<template>
  <p>refuse-check rendered</p>
</template>
