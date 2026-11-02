<script setup lang="ts">
const { loggedIn, user } = useUserSession()

const links = computed(() => loggedIn.value
  ? [
      { label: 'My account', to: '/account', icon: 'i-lucide-user' },
      ...(user.value?.role === 'admin' ? [{ label: 'Admin', to: '/admin', color: 'neutral' as const, variant: 'outline' as const }] : []),
    ]
  : [
      { label: 'Sign in', to: '/login', icon: 'i-lucide-log-in' },
      { label: 'Create account', to: '/register', color: 'neutral' as const, variant: 'outline' as const },
    ])
</script>

<template>
  <UContainer>
    <UPageHero
      title="Your new Frigear app"
      description="A Nuxt 4 app on the @frigear-nu modules: sign in, manage your account, and administer users."
      :links="links"
    />
  </UContainer>
</template>
