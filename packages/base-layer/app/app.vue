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
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/starter-light.png',
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <UApp>
    <AppHeader v-if="$route.meta.header !== false" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppFooter v-if="$route.meta.footer !== false" />
  </UApp>
</template>
