<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
  ],
  htmlAttrs: {
    lang: 'en',
  },
})

const { data: config } = await useConfig()
const { data: currentPage } = useCurrentPage()

const title = computed(() => {
  return currentPage.value?.title || stringOrPropValue(config.value?.name, 'long') || stringOrPropValue(config.value?.name, 'short')
})
const description = computed(() => currentPage.value?.description)

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <CookieConsentBanner />
  </UApp>
</template>
