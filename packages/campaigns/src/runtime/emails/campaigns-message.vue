<script setup lang="ts">
import { EmailFooter, EmailLayout } from '@frigear-nu/email-templates/components'

// A campaign email: a campaign to the subscribers of lists or to people. `bodyHtml` is the campaign's markdown, rendered and
// escaped on the server (`renderMarkdown`: bold, italics, links, paragraphs), its links already the recipient's tracked
// short links. The footer carries the recipient's unsubscribe and preferences links; `pixelUrl` (only when the campaign
// tracks opens) is the 1x1 image that marks it opened.
withDefaults(defineProps<{
  subject: string
  bodyHtml: string
  footer?: string
  unsubscribeUrl?: string | null
  unsubscribeLabel?: string
  preferencesUrl?: string | null
  preferencesLabel?: string
  pixelUrl?: string | null
}>(), {
  footer: 'You get this because you signed up for it.',
  unsubscribeUrl: null,
  unsubscribeLabel: 'Unsubscribe',
  preferencesUrl: null,
  preferencesLabel: 'Email preferences',
  pixelUrl: null,
})
</script>

<template>
  <EmailLayout :preview="subject">
    <ESubject>{{ subject }}</ESubject>
    <!-- Rendered and escaped server side by renderMarkdown. -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      style="font-size: 15px; line-height: 1.6"
      v-html="bodyHtml"
    />
    <!-- eslint-enable vue/no-v-html -->
    <img
      v-if="pixelUrl"
      :src="pixelUrl"
      width="1"
      height="1"
      alt=""
      style="display: block; border: 0; width: 1px; height: 1px"
    >
    <template #footer>
      <EmailFooter
        :unsubscribe-url="unsubscribeUrl ?? undefined"
        :unsubscribe-label="unsubscribeLabel"
        :preferences-url="preferencesUrl ?? undefined"
        :preferences-label="preferencesLabel"
      >
        {{ footer }}
      </EmailFooter>
    </template>
  </EmailLayout>
</template>
