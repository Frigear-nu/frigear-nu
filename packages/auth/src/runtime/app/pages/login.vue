<script setup lang="ts">
defineOptions({ name: 'UsersLoginPage' })

const t = useModuleT('auth')
const { login, pending, error, passwordLoginEnabled, passkeyLoginEnabled, oauthProviders } = useLogin()
const magicLink = useMagicLink()
const magicLinkEmail = ref('')
const magicLinkSent = ref(false)
// The emailed link redirects back here with `?error=magic-link` when it is invalid, used or expired.
const linkFailed = computed(() => useRoute().query.error === 'magic-link')
const passkeys = passkeyLoginEnabled.value ? usePasskeys() : undefined
const passkeyPending = ref(false)

const { requested: requestedRedirect, go: afterLogin } = useAfterLogin()

const magicLinkOpen = ref(false)
const providers = computed(() => [
  ...oauthProviders.value.map(provider => ({
    ...provider,
    // OAuth round trips lose the page query, so the server remembers the target.
    to: requestedRedirect.value ? `${provider.to}?redirect=${encodeURIComponent(requestedRedirect.value)}` : provider.to,
  })),
  ...(magicLink.isEnabled.value
    ? [{ label: t('magicLink.title', 'Magic Link'), icon: 'i-lucide-at-sign', onClick: () => { magicLinkOpen.value = !magicLinkOpen.value } }]
    : []),
  ...(passkeyLoginEnabled.value
    ? [{ label: t('passkey.login', 'Log in with a passkey'), icon: 'i-lucide-key-round', onClick: onPasskeyLogin }]
    : []),
])

const fields = computed(() => passwordLoginEnabled.value
  ? [
      { name: 'email', type: 'text' as const, label: t('email.label', 'Email'), required: true },
      { name: 'password', type: 'password' as const, label: t('password.label', 'Password'), required: true },
    ]
  : [])

const registerPath = useAuthPages().register
// An absolute register URL (e.g. the central frigear.nu sign-up) leaves the app and gets no `?redirect=`.
const registerExternal = !!registerPath && /^https?:\/\//.test(registerPath)
const registerLink = computed(() => registerPath
  ? (registerExternal || !requestedRedirect.value ? registerPath : `${registerPath}?redirect=${encodeURIComponent(requestedRedirect.value)}`)
  : undefined)
const forgotPasswordEnabled = useRuntimeConfig().public.authentication?.passwordReset === true

async function onSubmit(payload: { data: { email: string, password: string } }) {
  await login(payload.data)
  await afterLogin()
}

async function onMagicLink() {
  await magicLink.sendMagicLink({ email: magicLinkEmail.value, redirect: requestedRedirect.value })
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
  <AuthCard :title="t('signIn', 'Log in')">
    <template
      v-if="registerLink"
      #description
    >
      {{ t('dontHaveAnAccount', 'Don\'t have an account yet? ➜') }}
      <ULink
        :to="registerLink"
        :external="registerExternal"
        class="font-medium text-primary"
      >
        {{ t('signUp', 'Sign up') }}
      </ULink>.
    </template>

    <UAlert
      v-if="linkFailed"
      color="error"
      variant="subtle"
      :title="t('magicLink.invalid', 'This sign-in link is invalid or has expired.')"
    />
    <!-- Sent here from a page that needs an account (`?redirect=`); signing in returns there. -->
    <UAlert
      v-else-if="requestedRedirect"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      :title="t('signInToContinue', 'Sign in to continue.')"
    />

    <template v-if="magicLinkOpen">
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
          autofocus
          class="flex-1"
          :placeholder="t('email.label', 'Email')"
        />
        <UButton
          type="submit"
          :loading="magicLink.pending.value"
        >
          {{ t('magicLink.submit', 'Send link') }}
        </UButton>
      </form>
    </template>

    <UAuthForm
      :fields="fields"
      :providers="providers"
      :separator="t('or', 'or')"
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
  </AuthCard>
</template>
