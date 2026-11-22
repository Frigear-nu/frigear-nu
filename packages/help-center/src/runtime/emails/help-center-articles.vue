<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

// Links to help articles somebody sent (see `sendHelpArticles`). The texts arrive in the person's language
// (`helpSendEmailTexts`); the English ones are the defaults.
const props = withDefaults(defineProps<{
  name: string
  links: Array<{ title: string, url: string }>
  subject?: string
  heading?: string
  greeting?: string
  intro?: string
}>(), {
  subject: undefined,
  heading: 'Help articles for you',
  greeting: undefined,
  intro: undefined,
})
</script>

<template>
  <EmailLayout :preview="props.subject ?? props.heading">
    <ESubject>{{ props.subject ?? (links.length === 1 ? links[0]?.title : props.heading) }}</ESubject>
    <EmailHeading>
      {{ props.heading }}
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      {{ props.greeting ?? `Hi ${name},` }}
    </EmailText>
    <EmailText>
      {{ props.intro ?? (links.length === 1 ? 'Have a look at this article:' : 'Have a look at these articles:') }}
    </EmailText>
    <EmailButton
      v-for="link in links"
      :key="link.url"
      :href="link.url"
    >
      {{ link.title }}
    </EmailButton>
  </EmailLayout>
</template>
