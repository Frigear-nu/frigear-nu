<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent to the owner of a swap when somebody offers to take their shift (see `buildShiftSwapEmail`).
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
      A new offer for your shift
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
      See the offer
    </EmailButton>
  </EmailLayout>
</template>
