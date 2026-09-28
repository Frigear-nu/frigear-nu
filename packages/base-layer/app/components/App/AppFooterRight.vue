<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

const props = defineProps<{
  links?: ButtonProps[]
}>()

const appConfig = useAppConfig()
const github = computed(() => appConfig.github as { url?: string } | undefined)
const defaultLinks = computed<ButtonProps[]>(() => {
  const links = Object.entries(appConfig.socials || {}).map(([key, url]) => ({
    'icon': `i-simple-icons-${key}`,
    'to': url,
    'target': '_blank',
    'aria-label': `${key} social link`,
  }))

  if (github.value?.url) {
    links.push({
      'icon': 'i-simple-icons-github',
      'to': github.value.url,
      'target': '_blank',
      'aria-label': 'GitHub repository',
    })
  }

  return links
})

const footerLinks = computed<ButtonProps[]>(() => props.links !== undefined ? props.links : defaultLinks.value)
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
