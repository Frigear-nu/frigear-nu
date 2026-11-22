<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{
  name: string
  links: Array<{ title: string, url: string }>
}>()
</script>

<template>
  <EmailLayout preview="Help articles for you">
    <ESubject>{{ links.length === 1 ? links[0]?.title : 'Help articles for you' }}</ESubject>
    <EmailHeading>
      Help articles for you
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Hi {{ name }},
    </EmailText>
    <EmailText>
      Have a look at {{ links.length === 1 ? 'this article' : 'these articles' }}:
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
