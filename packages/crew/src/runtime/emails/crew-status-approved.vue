<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent when somebody joined an operation's crew (approved by staff, promoted off the waiting list or through an invite).
// `subject` and `message` are the operation's own texts or the built-in ones (see `buildCrewStatusEmail`).
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
      You are on the crew
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
      See your crew status
    </EmailButton>
  </EmailLayout>
</template>
