<script setup lang="ts">
// The signed-in user, and sign-out. Remote mode revokes the refresh token at the issuer, local mode ends the session;
// both return to `/`, which the `'/**'` rule sends on to /login.
const { user } = useUserSession()
const { logout } = useAuth()
const confirming = ref(false)
const signingOut = ref(false)

const profile = computed(() => user.value as { name?: string, email?: string } | null)
const name = computed(() => profile.value?.name ?? profile.value?.email ?? 'Signed in')
const email = computed(() => profile.value?.email)

async function signOut() {
  signingOut.value = true
  try {
    await logout()
  }
  finally {
    signingOut.value = false
    confirming.value = false
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

    <div>
      <UModal
        v-model:open="confirming"
        title="Sign out?"
        description="You need to sign in again to use the app."
      >
        <UButton
          label="Sign out"
          icon="i-lucide-log-out"
          color="error"
          variant="soft"
        />
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="outline"
              @click="confirming = false"
            />
            <UButton
              label="Sign out"
              color="error"
              :loading="signingOut"
              @click="signOut"
            />
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>
