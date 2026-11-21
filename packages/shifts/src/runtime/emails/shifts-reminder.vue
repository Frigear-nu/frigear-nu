<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent a day and a few hours before a shift starts (see `buildShiftReminderEmail`).
defineProps<{
  name: string
  subject: string
  message: string
  url?: string | null
}>()
</script>

<template>
  <EmailLayout :preview="subject">
    <ESubject>{{ subject }}</ESubject>
    <EmailHeading>
      Your shift is coming up
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Hi {{ name }},
    </EmailText>
    <EmailText>
      {{ message }}
    </EmailText>
    <EmailButton
      v-if="url"
      :href="url"
    >
      See your shift
    </EmailButton>
  </EmailLayout>
</template>
