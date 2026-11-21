<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent when somebody is on an operation's waiting list. `subject` and `message` are the operation's own texts or the
// built-in ones (see `buildCrewStatusEmail`); `statusUrl` is the page that shows the application.
defineProps<{
  name: string
  operationName: string
  teamName?: string
  role?: string
  subject: string
  message: string
  statusUrl?: string | null
}>()
</script>

<template>
  <EmailLayout :preview="subject">
    <ESubject>{{ subject }}</ESubject>
    <EmailHeading>
      You are on the waiting list
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Hi {{ name }},
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
      See your application
    </EmailButton>
  </EmailLayout>
</template>
