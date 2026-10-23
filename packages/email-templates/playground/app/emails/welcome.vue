<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailLinkFallback, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{
  name: string
  url: string
}>()
</script>

<template>
  <EmailLayout :preview="`Welcome, ${name}!`">
    <ESubject>Welcome, {{ name }}</ESubject>
    <EmailHeading>Welcome, {{ name }}!</EmailHeading>
    <EmailDivider />
    <EmailText>Thanks for signing up. Click the button below to get started.</EmailText>
    <EmailButton :href="url">
      Get started
    </EmailButton>
    <EmailLinkFallback :href="url" />
  </EmailLayout>
</template>
