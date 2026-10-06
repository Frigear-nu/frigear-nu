<script setup lang="ts">
defineOptions({ name: 'AccountSecurityPage' })

const { user } = useUserSession()
const { changePassword, pending, error } = useAccount()
// Guarded like `@frigear-nu/users`' own `login.vue` - `useUserPasskeys()` calls `useWebAuthn()`
// internally, which isn't available when WebAuthn is disabled (the default).
const webAuthnEnabled = useRuntimeConfig().public.users?.webAuthn === true
const passkeys = webAuthnEnabled ? useUserPasskeys() : undefined

const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const passkeyPending = ref(false)

async function onSubmitPassword() {
  await changePassword({
    currentPassword: currentPassword.value,
    newPassword: newPassword.value,
    confirmNewPassword: confirmNewPassword.value,
  })
  currentPassword.value = ''
  newPassword.value = ''
  confirmNewPassword.value = ''
}

async function onRegisterPasskey() {
  passkeyPending.value = true
  try {
    await passkeys?.registerPasskey(user.value?.email ?? '')
  }
  finally {
    passkeyPending.value = false
  }
}
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UPageCard title="Change password">
          <UFormField
            label="Current password"
            name="currentPassword"
          >
            <UInput
              v-model="currentPassword"
              type="password"
            />
          </UFormField>
          <UFormField
            label="New password"
            name="newPassword"
          >
            <UInput
              v-model="newPassword"
              type="password"
            />
          </UFormField>
          <UFormField
            label="Confirm new password"
            name="confirmNewPassword"
          >
            <UInput
              v-model="confirmNewPassword"
              type="password"
            />
          </UFormField>
          <UButton
            class="mt-4"
            :loading="pending"
            label="Change password"
            @click="onSubmitPassword"
          />
        </UPageCard>
        <UPageCard
          v-if="passkeys?.isEnabled.value"
          class="mt-4"
          title="Passkeys"
        >
          <UButton
            :loading="passkeyPending"
            label="Register a passkey"
            @click="onRegisterPasskey"
          />
        </UPageCard>
        <UAlert
          v-if="error"
          class="mt-4"
          color="error"
          :title="error"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
