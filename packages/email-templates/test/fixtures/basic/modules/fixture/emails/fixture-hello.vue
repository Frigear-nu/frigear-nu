<script setup lang="ts">
defineProps<{ name: string }>()
</script>

<template>
  <EHtml>
    <EBody>
      <ESubject>Hello from the module</ESubject>
      <EText>Module template for {{ name }}</EText>
    </EBody>
  </EHtml>
</template>
