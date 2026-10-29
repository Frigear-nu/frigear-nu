<script setup lang="ts">
defineOptions({ name: 'UsersLoginPage' })

const t = useModuleT('auth')
const route = useRoute()
const { login, pending, error, passwordLoginEnabled, passkeyLoginEnabled, oauthProviders } = useLogin()
const magicLink = useMagicLink()
const magicLinkEmail = ref('')
const magicLinkSent = ref(false)
// The emailed link redirects back here with `?error=magic-link` when it is invalid, used or expired.
const linkFailed = computed(() => route.query.error === 'magic-link')
// An OAuth provider with `signUp: false` sends an email without an account back here with `?error=oauth-signup`.
const noAccount = computed(() => route.query.error === 'oauth-signup')
const passkeys = passkeyLoginEnabled.value ? usePasskeys() : undefined
const passkeyPending = ref(false)

const { requested: requestedRedirect, go: afterLogin } = useAfterLogin()

// Why the page that sent them here needs an account: `?reason=<namespace>` reads `<namespace>.signInReason.title` and
// `.description`, so each module words its own reason. Unknown reasons get the generic text.
const reason = route.query.reason
const reasonT = typeof reason === 'string' && /^[a-z][\w-]*(?:\.[\w-]+)*$/i.test(reason) ? useModuleT(reason) : t
const signInReason = computed(() => ({
  title: reasonT('signInReason.title', t('signInReason.title', 'You need to be signed in to do this')),
  description: reasonT('signInReason.description', t('signInReason.description', 'Sign in to continue. Afterwards you are sent straight back to where you were.')),
}))

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

    <!-- The last alert is for guests sent here from a page that needs an account (`?redirect=`); signing in returns
         there. Keep comments out of a v-if chain: in dev they turn a branch into a fragment and break hydration. -->
    <UAlert
      v-if="linkFailed"
      color="error"
      variant="subtle"
      :title="t('magicLink.invalid', 'This sign-in link is invalid or has expired.')"
    />
    <UAlert
      v-else-if="noAccount"
      color="error"
      variant="subtle"
      :title="t('errors.signIn.noAccount', 'There is no account for this email. Ask for an invitation, or sign in another way.')"
    />
    <UAlert
      v-else-if="requestedRedirect"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      :title="signInReason.title"
      :description="signInReason.description"
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
