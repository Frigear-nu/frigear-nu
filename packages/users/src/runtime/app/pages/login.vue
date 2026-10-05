<script setup lang="ts">
defineOptions({ name: 'UsersLoginPage' })

const { login, pending, error, passwordLoginEnabled, passkeyLoginEnabled, oauthProviders } = useUserLogin()
const passkeys = passkeyLoginEnabled.value ? useUserPasskeys() : undefined
const passkeyPending = ref(false)

const fields = computed(() => passwordLoginEnabled.value
  ? [
      { name: 'email', type: 'text' as const, label: 'Email', required: true },
      { name: 'password', type: 'password' as const, label: 'Password', required: true },
    ]
  : [])

async function onSubmit(payload: { data: { email: string, password: string } }) {
  await login(payload.data)
  await navigateTo('/')
}

async function onPasskeyLogin() {
  error.value = null
  passkeyPending.value = true

  try {
    await passkeys?.authenticateWithPasskey()
    await navigateTo('/')
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to log in.'
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
        <UAuthForm
          title="Log in"
          :fields="fields"
          :providers="oauthProviders"
          :loading="pending"
          :submit="{ label: 'Log in' }"
          @submit="onSubmit"
        >
          <template
            v-if="error"
            #validation
          >
            <UAlert
              color="error"
              :title="error"
            />
          </template>
        </UAuthForm>
        <UButton
          v-if="passkeyLoginEnabled"
          class="mt-4 w-full"
          :loading="passkeyPending"
          :disabled="pending"
          @click="onPasskeyLogin"
        >
          Log in with a passkey
        </UButton>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
