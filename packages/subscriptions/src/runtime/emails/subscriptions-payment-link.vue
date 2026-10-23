<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailLinkFallback, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{
  name: string
  label: string
  url: string
}>()
</script>

<template>
  <EmailLayout preview="Complete your membership">
    <ESubject>Complete your {{ label }} membership</ESubject>
    <EmailHeading>
      Complete your {{ label }} membership
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Hi {{ name }},
    </EmailText>
    <EmailText>
      Use the button below to complete your {{ label }} membership. The link is valid for 24 hours.
    </EmailText>
    <EmailButton
      :href="url"
    >
      Complete membership
    </EmailButton>
    <EmailLinkFallback :href="url" />
    <EmailDivider />
    <EmailText>
      If you weren’t expecting this email, you can safely ignore it.
    </EmailText>
  </EmailLayout>
</template>
