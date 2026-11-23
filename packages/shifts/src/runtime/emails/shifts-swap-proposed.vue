<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent to the holder of the shift a trade asks for in return (a targeted trade, see `buildShiftSwapEmail`).
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
      Somebody wants to trade shifts with you
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
      See the open swaps
    </EmailButton>
  </EmailLayout>
</template>
