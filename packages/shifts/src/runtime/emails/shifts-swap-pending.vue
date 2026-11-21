<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent to the leads of the team(s) when a swap waits for approval (`approval` mode, see `buildShiftSwapEmail`).
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
      A shift swap waits for your approval
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
      Open the swaps
    </EmailButton>
  </EmailLayout>
</template>
