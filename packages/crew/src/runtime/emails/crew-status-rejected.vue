<script setup lang="ts">
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent when somebody's application was rejected. `subject` and `message` are the operation's own texts or the built-in
// ones (see `buildCrewStatusEmail`).
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
}>(), {
  teamName: undefined,
  role: undefined,
  statusUrl: null,
  greeting: undefined,
  heading: 'About your application',
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
  </EmailLayout>
</template>
