<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent when somebody is on an operation's waiting list. `subject` and `message` are the operation's own texts or the
// built-in ones (see `buildCrewStatusEmail`); `statusUrl` is the page that shows the application.
withDefaults(defineProps<{
  name: string
  operationName: string
  teamName?: string
  role?: string
  subject: string
  message: string
  statusUrl?: string | null
  /** The person's language: the greeting line, the heading and the button. English by default. */
  greeting?: string
  heading?: string
  button?: string
}>(), {
  teamName: undefined,
  role: undefined,
  statusUrl: null,
  greeting: undefined,
  heading: 'You are on the waiting list',
  button: 'See your application',
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
    <EmailText
      v-for="(part, index) in message.split(/\n{2,}/)"
      :key="index"
    >
      {{ part }}
    </EmailText>
    <EmailButton
      v-if="statusUrl"
      :href="statusUrl"
    >
      {{ button }}
    </EmailButton>
  </EmailLayout>
</template>
