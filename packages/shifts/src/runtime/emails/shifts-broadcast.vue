<script setup lang="ts">
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// A message from a coordinator or team lead to the people on their teams (see `buildShiftBroadcastEmail`).
defineProps<{
  name: string
  subject: string
  message: string
}>()
</script>

<template>
  <EmailLayout :preview="subject">
    <ESubject>{{ subject }}</ESubject>
    <EmailHeading>
      {{ subject }}
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Hi {{ name }},
    </EmailText>
    <EmailText style="white-space: pre-line">
      {{ message }}
    </EmailText>
  </EmailLayout>
</template>
