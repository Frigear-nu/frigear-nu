<script setup lang="ts">
import EmailDivider from './EmailDivider.vue'
import EmailText from './EmailText.vue'
</script>

<template>
  <EmailDivider />
  <EmailText
    variant="small"
    style="margin: 0"
  >
    <slot>This email was sent automatically for security reasons.</slot>
  </EmailText>
</template>
