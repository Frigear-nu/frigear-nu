<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailLinkFallback, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{
  url: string
}>()
</script>

<template>
  <EmailLayout preview="Reset your password">
    <ESubject>Reset your password</ESubject>
    <EmailHeading>
      Reset your password
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      You requested a password reset link. Click the button below to reset your password.
    </EmailText>
    <EmailText>
      This link will expire shortly and can only be used once.
    </EmailText>
    <EmailButton
      :href="url"
    >
      Reset password
    </EmailButton>
    <EmailLinkFallback :href="url" />
    <EmailDivider />
    <EmailText>
      If you didn’t request this email, you can safely ignore it. No action is required.
    </EmailText>
  </EmailLayout>
</template>
