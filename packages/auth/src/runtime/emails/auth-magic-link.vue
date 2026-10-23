<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailLinkFallback, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{
  name: string
  url: string
}>()
</script>

<template>
  <EmailLayout preview="Your secure sign-in link">
    <ESubject>Your sign-in link</ESubject>
    <EmailHeading>
      Your magic link
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Hi {{ name }},
    </EmailText>
    <EmailText>
      You requested a secure sign-in link. Click the button below to sign in to your account.
    </EmailText>
    <EmailText>
      The link can only be used once and expires in 2 hours.
    </EmailText>
    <EmailButton
      :href="url"
    >
      Sign in
    </EmailButton>
    <EmailLinkFallback :href="url" />
    <EmailDivider />
    <EmailText>
      If you didn’t request this email, you can safely ignore it. No action is required.
    </EmailText>
  </EmailLayout>
</template>
