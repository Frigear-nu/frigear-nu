<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailLinkFallback, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{
  name: string
  newEmail: string
  url: string
}>()
</script>

<template>
  <EmailLayout preview="Alert: your email address was changed">
    <ESubject>Your email address was changed</ESubject>
    <EmailHeading tone="danger">
      Email address changed
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Hi {{ name }},
    </EmailText>
    <EmailText>
      This is a security alert. The email address on your account was changed to <strong>{{ newEmail }}</strong>.
    </EmailText>
    <EmailText>
      If you made this change, no further action is required. If you didn’t, undo it within 7 days with the button below.
    </EmailText>
    <EmailButton
      :href="url"
      color="danger"
    >
      I didn’t make this change
    </EmailButton>
    <EmailLinkFallback :href="url" />
    <EmailDivider />
    <EmailText>
      If you did not change your email, we recommend you secure your account by resetting your password.
    </EmailText>
  </EmailLayout>
</template>
