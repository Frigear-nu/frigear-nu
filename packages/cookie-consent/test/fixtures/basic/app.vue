<script setup lang="ts">
const { hasResponded, isAllowed } = useCookieConsent()
</script>

<template>
  <div>basic</div>
  <p id="consent">
    responded: {{ hasResponded }}, analytics: {{ isAllowed('analytics') }}
  </p>
</template>
