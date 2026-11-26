<script setup lang="ts">
import EmailDivider from './EmailDivider.vue'
import EmailText from './EmailText.vue'

withDefaults(defineProps<{
  /** Where the recipient stops getting this kind of email. Shown as a link under the footer text when set. */
  unsubscribeUrl?: string
  /** Where the recipient chooses what they get. Shown as a link under the footer text when set. */
  preferencesUrl?: string
  /** The text of the unsubscribe link, in the recipient's language. */
  unsubscribeLabel?: string
  /** The text of the preferences link, in the recipient's language. */
  preferencesLabel?: string
}>(), {
  unsubscribeUrl: undefined,
  preferencesUrl: undefined,
  unsubscribeLabel: 'Unsubscribe',
  preferencesLabel: 'Email preferences',
})
</script>

<template>
  <EmailDivider />
  <EmailText
    variant="small"
    style="margin: 0"
  >
    <slot>This email was sent automatically for security reasons.</slot>
  </EmailText>
  <EmailText
    v-if="unsubscribeUrl || preferencesUrl"
    variant="small"
    style="margin: 8px 0 0"
  >
    <a
      v-if="unsubscribeUrl"
      :href="unsubscribeUrl"
      style="color: inherit; text-decoration: underline"
    >{{ unsubscribeLabel }}</a>
    <template v-if="unsubscribeUrl && preferencesUrl">
      &middot;
    </template>
    <a
      v-if="preferencesUrl"
      :href="preferencesUrl"
      style="color: inherit; text-decoration: underline"
    >{{ preferencesLabel }}</a>
  </EmailText>
</template>
