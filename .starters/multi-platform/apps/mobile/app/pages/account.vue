<script setup lang="ts">
// The signed-in user, and sign-out. Signing out revokes the refresh token at the issuer and returns to `/`, which the
// `'/**'` rule sends on to /login.
const { user } = useUserSession()
const { logout } = useAuth()
const native = useNative()
const signingOut = ref(false)

// The default mapping of client mode: `{ id, sub, name, email, avatar }` from the ID token claims. Map other
// claims (`preferred_username`, ...) with `authentication.client.mapUser`.
const profile = computed(() => user.value as { name?: string, email?: string } | null)
const name = computed(() => profile.value?.name ?? profile.value?.email ?? 'Signed in')
const email = computed(() => profile.value?.email)

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
