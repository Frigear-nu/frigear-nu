<script setup lang="ts">
// The signed-in user, and sign-out. Signing out revokes the refresh token at the issuer and returns to /login.
const { claims, logout } = useOAuth()
const native = useNative()
const signingOut = ref(false)

const name = computed(() => String(claims.value?.name ?? claims.value?.preferred_username ?? 'Signed in'))
const email = computed(() => claims.value?.email ? String(claims.value.email) : undefined)

async function signOut() {
  const confirmed = await native.confirm({
    title: 'Sign out?',
    description: 'You need to sign in again to use the app.',
    confirmLabel: 'Sign out',
    destructive: true,
  })
  if (!confirmed) return
  signingOut.value = true
  try {
    await logout()
  }
  finally {
    signingOut.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UCard>
      <UUser
        :name="name"
        :description="email"
        :avatar="{ alt: name }"
        size="lg"
      />
    </UCard>

    <UButton
      label="Sign out"
      icon="i-lucide-log-out"
      color="error"
      variant="soft"
      size="lg"
      block
      :loading="signingOut"
      @click="signOut"
    />
  </div>
</template>
