<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
  ],
})

usePageSeo()
useLocaleAlternates()
</script>

<template>
  <UApp>
    <!-- Feedback while a client-side navigation loads; the default throttle hides it on fast ones. -->
    <NuxtLoadingIndicator color="var(--ui-primary)" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <CookieConsentBanner />
  </UApp>
</template>
