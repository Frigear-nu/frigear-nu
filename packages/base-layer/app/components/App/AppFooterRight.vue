<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

type FooterLink = {
  'label'?: string
  'to'?: string
  'icon'?: string
  'variant'?: ButtonProps['variant']
  'size'?: ButtonProps['size']
  'target'?: string
  'aria-label'?: string
}

const props = defineProps<{
  links?: FooterLink[]
}>()

const appConfig = useAppConfig()
const defaultLinks = computed<FooterLink[]>(() => {
  const links = Object.entries(appConfig.socials || {}).map(([key, url]) => ({
    'icon': `i-simple-icons-${key}`,
    'to': url,
    'target': '_blank',
    'aria-label': `${key} social link`,
  }))

  if (appConfig.github?.url) {
    links.push({
      'icon': 'i-simple-icons-github',
      'to': appConfig.github.url,
      'target': '_blank',
      'aria-label': 'GitHub repository',
    })
  }

  return links
})
const footerLinks = computed<FooterLink[]>(() => props.links !== undefined ? props.links : defaultLinks.value)
</script>

<template>
  <template v-if="footerLinks.length">
    <UButton
      v-for="(link, index) of footerLinks"
      :key="index"
      size="sm"
      v-bind="{ color: 'neutral', variant: 'ghost', ...link }"
    />
  </template>
  <UColorModeButton />
</template>
