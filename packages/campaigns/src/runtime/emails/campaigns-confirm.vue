<script setup lang="ts">
import { EmailButton, EmailDivider, EmailFooter, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Sent when somebody signs up for a newsletter with double opt-in: the link confirms the subscription (on a page that
// asks for a click, so link scanners confirm nothing). The texts come in the person's language from
// `buildCampaignsConfirmEmail`; the defaults are English.
withDefaults(defineProps<{
  listName: string
  confirmUrl: string
  /** Unsubscribes the pending subscription, so no further confirmation is sent. */
  unsubscribeUrl?: string | null
  subject?: string
  heading?: string
  greeting?: string
  intro?: string
  button?: string
  expiry?: string
  footer?: string
  unsubscribeLabel?: string
}>(), {
  unsubscribeUrl: null,
  subject: 'Confirm your subscription',
  heading: 'Confirm your subscription',
  greeting: 'Hi,',
  intro: 'Someone, hopefully you, signed this address up for a newsletter. Confirm it, and we will start sending it to you.',
  button: 'Confirm subscription',
  expiry: undefined,
  footer: 'If you did not sign up, ignore this email: nothing is sent to you unless you confirm.',
  unsubscribeLabel: 'Not me, unsubscribe',
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
      {{ greeting }}
    </EmailText>
    <EmailText>
      {{ intro }}
    </EmailText>
    <EmailButton :href="confirmUrl">
      {{ button }}
    </EmailButton>
    <EmailText
      v-if="expiry"
      variant="small"
    >
      {{ expiry }}
    </EmailText>
    <template #footer>
      <EmailFooter
        :unsubscribe-url="unsubscribeUrl ?? undefined"
        :unsubscribe-label="unsubscribeLabel"
      >
        {{ footer }}
      </EmailFooter>
    </template>
  </EmailLayout>
</template>
