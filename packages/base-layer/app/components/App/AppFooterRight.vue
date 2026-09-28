<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

const props = defineProps<{
  links?: ButtonProps[]
}>()

const appConfig = useAppConfig()
const github = computed(() => appConfig.github as { url?: string } | undefined)

const footerLinks = computed<ButtonProps[]>(() => props.links || [
  ...Object.entries(appConfig.socials || {}).map(([key, url]) => ({
    'icon': `i-simple-icons-${key}`,
    'to': url,
    'target': '_blank',
    'aria-label': `${key} social link`,
  })),
  github.value?.url && {
    'icon': 'i-simple-icons-github',
    'to': github.value.url,
    'target': '_blank',
    'aria-label': 'GitHub repository',
  },
].filter(Boolean) as ButtonProps[])
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
