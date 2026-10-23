<script setup lang="ts">
import EmailText from './EmailText.vue'

defineProps<{
  href: string
}>()
</script>

<template>
  <EmailText variant="muted">
    <slot>Or copy this link to your browser:</slot> <a
      :href="href"
      style="color: inherit; text-decoration: underline"
    >{{ href }}</a>
  </EmailText>
</template>
