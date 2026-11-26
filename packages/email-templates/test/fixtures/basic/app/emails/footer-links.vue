<script setup lang="ts">
import { EmailFooter, EmailLayout, EmailText } from '../../../../../src/runtime/components'

defineProps<{ unsubscribeUrl?: string, preferencesUrl?: string }>()
</script>

<template>
  <EmailLayout>
    <ESubject>Footer links</ESubject>
    <EmailText>News for you.</EmailText>
    <template #footer>
      <EmailFooter
        :unsubscribe-url="unsubscribeUrl"
        :preferences-url="preferencesUrl"
        unsubscribe-label="Afmeld"
      >
        You get this because you subscribed.
      </EmailFooter>
    </template>
  </EmailLayout>
</template>
