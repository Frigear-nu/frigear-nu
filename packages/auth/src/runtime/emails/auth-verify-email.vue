<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailLinkFallback, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{
  name: string
  url: string
}>()
</script>

<template>
  <EmailLayout preview="Verify your email address to get started">
    <ESubject>Welcome! Please verify your email</ESubject>
    <EmailHeading>
      Welcome, {{ name }}!
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Your account has been created.
    </EmailText>
    <EmailText>
      Please verify your email address by clicking the button below. This also signs you in.
    </EmailText>
    <EmailButton
      :href="url"
    >
      Verify email
    </EmailButton>
    <EmailLinkFallback :href="url" />
    <EmailDivider />
    <EmailText>
      If you didn’t create an account, you can safely ignore this email.
    </EmailText>
  </EmailLayout>
</template>
