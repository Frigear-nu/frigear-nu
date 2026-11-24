<script setup lang="ts">
// The window: a top bar with the app's pages once signed in, and the page below it. The sign-in pages show without it.
const { loggedIn } = useUserSession()
const { appName } = useRuntimeConfig().public.desktop

const links = [
  { label: 'Home', to: '/', icon: 'i-lucide-house' },
  { label: 'Account', to: '/account', icon: 'i-lucide-circle-user-round' },
]
</script>

<template>
  <UApp>
    <header
      v-if="loggedIn"
      class="border-b border-default"
    >
      <UContainer class="flex h-14 items-center justify-between gap-4">
        <span class="font-semibold">{{ appName }}</span>
        <UNavigationMenu :items="links" />
      </UContainer>
    </header>
    <UMain>
      <UContainer class="py-6">
        <NuxtPage />
      </UContainer>
    </UMain>
  </UApp>
</template>
