<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent a day and a few hours before a shift starts (see `buildShiftReminderEmail`). The texts arrive in the person's
// language; the English ones are the defaults.
withDefaults(defineProps<{
  name: string
  subject: string
  message: string
  url?: string | null
  greeting?: string
  heading?: string
  button?: string
}>(), {
  url: null,
  greeting: undefined,
  heading: 'Your shift is coming up',
  button: 'See your shift',
})
</script>

<template>
  <EmailLayout :preview="subject">
    <ESubject>{{ subject }}</ESubject>
    <EmailHeading>
      {{ heading }}
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      {{ greeting ?? `Hi ${name},` }}
    </EmailText>
    <EmailText>
      {{ message }}
    </EmailText>
    <EmailButton
      v-if="url"
      :href="url"
    >
      {{ button }}
    </EmailButton>
  </EmailLayout>
</template>
