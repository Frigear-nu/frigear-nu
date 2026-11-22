<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent to both people when a swap is done: the shift (or, in a trade, both shifts) changed hands (see `buildShiftSwapEmail`).
defineProps<{
  name: string
  subject: string
  message: string
  url?: string | null
  /** A trade: the message names both shifts. */
  trade?: boolean
}>()
</script>

<template>
  <EmailLayout :preview="subject">
    <ESubject>{{ subject }}</ESubject>
    <EmailHeading>
      {{ trade ? 'Shift trade done' : 'Shift swap done' }}
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
      See your shifts
    </EmailButton>
  </EmailLayout>
</template>
