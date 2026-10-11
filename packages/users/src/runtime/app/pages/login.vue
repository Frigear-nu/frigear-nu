<script setup lang="ts">
defineOptions({ name: 'UsersLoginPage' })

const t = useModuleT('auth')
const { login, pending, error, passwordLoginEnabled, passkeyLoginEnabled, oauthProviders } = useUserLogin()
const magicLink = useUserMagicLink()
const magicLinkEmail = ref('')
const magicLinkSent = ref(false)
// The emailed link redirects back here with `?error=magic-link` when it is invalid, used or expired.
const linkFailed = computed(() => useRoute().query.error === 'magic-link')
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

const registerPath = useRuntimeConfig().public.users?.pages?.register
const registerLink = computed(() => registerPath
  ? (redirectTarget.value === '/' ? registerPath : `${registerPath}?redirect=${encodeURIComponent(redirectTarget.value)}`)
  : undefined)
const forgotPasswordEnabled = useRuntimeConfig().public.users?.passwordReset === true

async function onSubmit(payload: { data: { email: string, password: string } }) {
  await login(payload.data)
  await afterLogin()
}

async function onMagicLink() {
  await magicLink.sendMagicLink({ email: magicLinkEmail.value, redirect: redirectTarget.value })
  magicLinkSent.value = true
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
  <UsersAuthCard
    :title="t('signIn', 'Log in')"
    icon="i-lucide-log-in"
  >
    <UAlert
      v-if="linkFailed"
      color="error"
      variant="subtle"
      :title="t('magicLink.invalid', 'This sign-in link is invalid or has expired.')"
    />

    <UAuthForm
      :fields="fields"
      :providers="oauthProviders"
      :loading="pending"
      :submit="{ label: t('signIn', 'Log in'), block: true }"
      @submit="onSubmit"
    >
      <template
        v-if="forgotPasswordEnabled && passwordLoginEnabled"
        #password-hint
      >
        <ULink
          to="/forgot-password"
          class="text-sm font-medium text-primary"
          tabindex="-1"
        >
          {{ t('forgotPassword.title', 'Forgot password?') }}
        </ULink>
      </template>
      <template
        v-if="error"
        #validation
      >
        <UAlert
          color="error"
          variant="subtle"
          :title="error"
        />
      </template>
    </UAuthForm>

    <template v-if="magicLink.isEnabled.value">
      <USeparator :label="t('or', 'or')" />
      <UAlert
        v-if="magicLinkSent"
        :title="t('email.sent.title', 'E-mail sent!')"
        :description="t('email.sent.description', 'We have sent you an e-mail. Check your inbox or spam.')"
      />
      <form
        v-else
        class="flex gap-2"
        @submit.prevent="onMagicLink"
      >
        <UInput
          v-model="magicLinkEmail"
          type="email"
          required
          class="flex-1"
          :placeholder="t('email.label', 'Email')"
        />
        <UButton
          type="submit"
          variant="outline"
          :loading="magicLink.pending.value"
        >
          {{ t('magicLink.submit', 'Send link') }}
        </UButton>
      </form>
    </template>

    <UButton
      v-if="passkeyLoginEnabled"
      block
      variant="outline"
      icon="i-lucide-key-round"
      :loading="passkeyPending"
      :disabled="pending"
      @click="onPasskeyLogin"
    >
      {{ t('passkey.login', 'Log in with a passkey') }}
    </UButton>

    <template
      v-if="registerLink"
      #footer
    >
      {{ t('noAccount', 'Don\'t have an account?') }}
      <ULink
        :to="registerLink"
        class="font-medium text-primary"
      >
        {{ t('signUp', 'Sign up') }}
      </ULink>
    </template>
  </UsersAuthCard>
</template>
