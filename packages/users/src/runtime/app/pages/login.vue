<script setup lang="ts">
defineOptions({ name: 'UsersLoginPage' })

const t = useModuleT('auth')
const { login, pending, error, passwordLoginEnabled, passkeyLoginEnabled, oauthProviders } = useUserLogin()
const passkeys = passkeyLoginEnabled.value ? useUserPasskeys() : undefined
const passkeyPending = ref(false)

// Only same-origin absolute paths are followed (`/oauth/authorize?...`), never `//host` or full URLs.
const redirectTarget = computed(() => {
  const target = useRoute().query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
})
const afterLogin = () => navigateTo(redirectTarget.value, { external: redirectTarget.value !== '/' })

const fields = computed(() => passwordLoginEnabled.value
  ? [
      { name: 'email', type: 'text' as const, label: t('email.label', 'Email'), required: true },
      { name: 'password', type: 'password' as const, label: t('password.label', 'Password'), required: true },
    ]
  : [])

async function onSubmit(payload: { data: { email: string, password: string } }) {
  await login(payload.data)
  await afterLogin()
}

async function onPasskeyLogin() {
  error.value = null
  passkeyPending.value = true

  try {
    await passkeys?.authenticateWithPasskey()
    await afterLogin()
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
          :title="t('signIn', 'Log in')"
          :fields="fields"
          :providers="oauthProviders"
          :loading="pending"
          :submit="{ label: t('signIn', 'Log in') }"
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
          {{ t('passkey.login', 'Log in with a passkey') }}
        </UButton>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
