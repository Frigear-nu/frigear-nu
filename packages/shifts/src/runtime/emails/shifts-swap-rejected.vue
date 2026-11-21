<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent when an offer was turned down by the owner, or a swap was rejected by an approver (see `buildShiftSwapEmail`).
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
      The swap did not go through
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
      See the swaps
    </EmailButton>
  </EmailLayout>
</template>
