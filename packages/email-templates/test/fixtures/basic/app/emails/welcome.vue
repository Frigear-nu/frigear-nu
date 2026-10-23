<script setup lang="ts">
defineProps<{ name: string }>()
</script>

<template>
  <EHtml>
    <EBody>
      <ESubject>Welcome, {{ name }}</ESubject>
      <EText>Hi {{ name }}, welcome aboard.</EText>
    </EBody>
  </EHtml>
</template>
