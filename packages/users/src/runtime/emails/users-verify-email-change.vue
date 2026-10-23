<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailLinkFallback, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{
  name: string
  url: string
}>()
</script>

<template>
  <EmailLayout preview="Confirm your new email address">
    <ESubject>Confirm your new email address</ESubject>
    <EmailHeading>
      Confirm your new email address
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Hi {{ name }},
    </EmailText>
    <EmailText>
      You requested to change the email address on your account. Please confirm this new address to complete the change. The link expires in 24 hours.
    </EmailText>
    <EmailButton
      :href="url"
    >
      Confirm email change
    </EmailButton>
    <EmailLinkFallback :href="url" />
    <EmailDivider />
    <EmailText>
      If you didn’t request this change, your account may be at risk. We recommend reviewing your security settings.
    </EmailText>
  </EmailLayout>
</template>
