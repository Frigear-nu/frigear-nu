<script setup lang="ts">
import { computed, navigateTo, ref, useAfterLogin, useAuthPages, useFrigearHandoff, useLogin, useMagicLink, useModuleT, usePasskeys, useRoute, useRouter, useRuntimeConfig } from '#imports'
import { isAppPage } from '../utils/after-login'

defineOptions({ name: 'UsersLoginPage' })

const t = useModuleT('auth')
const route = useRoute()
const { login, pending, error, passwordLoginEnabled, passkeyLoginEnabled, oauthProviders } = useLogin()
const magicLink = useMagicLink()
const magicLinkSent = ref(false)
// The emailed link redirects back here with `?error=magic-link` when it is invalid, used or expired.
const linkFailed = computed(() => route.query.error === 'magic-link')
// An OAuth provider with `signUp: false` sends an email without an account back here with `?error=oauth-signup`.
const noAccount = computed(() => route.query.error === 'oauth-signup')
// A provider (or frigear.nu) that has not verified the email sends the user back with `?error=oauth-unverified`.
const unverifiedEmail = computed(() => route.query.error === 'oauth-unverified')
// A provider callback that did not come from a sign-in started in this browser comes back with `?error=oauth-state`.
const stateMismatch = computed(() => route.query.error === 'oauth-state')
const passkeys = passkeyLoginEnabled.value ? usePasskeys() : undefined
const passkeyPending = ref(false)

const { requested: requestedRedirect, go: afterLogin } = useAfterLogin()

// "Log in with frigear.nu" in the system browser while this window waits (`oauth.frigear.handoff`, desktop apps).
const handoff = useFrigearHandoff()
const router = useRouter()
const handoffError = computed(() => {
  switch (handoff.error.value) {
    case 'denied': return t('handoff.denied', 'The sign-in was cancelled in the browser.')
    case 'expired': return t('handoff.expired', 'The sign-in took too long. Start it again.')
    case 'unverified': return t('errors.signIn.unverifiedEmail', 'The account you signed in with has not verified this email address. Verify it there, or sign in another way.')
    case 'failed': return t('handoff.failed', 'The sign-in could not be completed. Try again.')
    default: return null
  }
})

async function onFrigearHandoff() {
  const target = await handoff.start({ redirect: requestedRedirect.value })
  if (target) await navigateTo(target, { external: !isAppPage(router.resolve(target).matched) })
}

// Why the page that sent them here needs an account: `?reason=<namespace>` reads `<namespace>.signInReason.title` and
// `.description`, so each module words its own reason. Unknown reasons get the generic text.
const reason = route.query.reason
const reasonT = typeof reason === 'string' && /^[a-z][\w-]*(?:\.[\w-]+)*$/i.test(reason) ? useModuleT(reason) : t
const signInReason = computed(() => ({
  title: reasonT('signInReason.title', t('signInReason.title', 'You need to be signed in to do this')),
  description: reasonT('signInReason.description', t('signInReason.description', 'Sign in to continue. Afterwards you are sent straight back to where you were.')),
}))

// The sign-in link goes to the email typed in the form: a second button under "Log in", so the action sits under the
// field it uses. Without password sign-in, the form is the email alone and its submit sends the link.
const magicLinkOnly = computed(() => !passwordLoginEnabled.value && magicLink.isEnabled.value)
const magicLinkExtra = computed(() => passwordLoginEnabled.value && magicLink.isEnabled.value)
const authForm = ref<{ state: { email?: string } } | null>(null)
const sentTo = ref('')
const providers = computed(() => [
  ...oauthProviders.value.map(provider => provider.key === 'frigear' && handoff.isEnabled.value
    // The window stays and waits; frigear.nu opens outside it.
    ? { key: provider.key, label: provider.label, icon: provider.icon, loading: handoff.pending.value, onClick: onFrigearHandoff }
    : {
        ...provider,
        // OAuth round trips lose the page query, so the server remembers the target.
        to: requestedRedirect.value ? `${provider.to}?redirect=${encodeURIComponent(requestedRedirect.value)}` : provider.to,
      }),
  ...(passkeyLoginEnabled.value
    ? [{ label: t('passkey.login', 'Log in with a passkey'), icon: 'i-lucide-key-round', onClick: onPasskeyLogin }]
    : []),
])

const fields = computed(() => {
  if (passwordLoginEnabled.value) {
    return [
      { name: 'email', type: 'email' as const, label: t('email.label', 'Email'), autocomplete: 'username', required: true },
      { name: 'password', type: 'password' as const, label: t('password.label', 'Password'), autocomplete: 'current-password', required: true },
    ]
  }
  if (magicLinkOnly.value) {
    return [{
      name: 'email',
      type: 'email' as const,
      label: t('email.label', 'Email'),
      description: t('magicLink.modal.in.description', 'You can sign in with your e-mail, we\'ll send you a link.'),
      autocomplete: 'email',
      required: true,
    }]
  }
  return []
})

/** Emails a sign-in link to `email`; a failed send is shown through `magicLink.error`. */
async function sendLink(email: string | undefined) {
  error.value = null
  const address = email?.trim() ?? ''
  if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(address)) {
    magicLink.error.value = t('magicLink.emailRequired', 'Enter your e-mail above to get a sign-in link.')
    return
  }
  await magicLink.sendMagicLink({ email: address, redirect: requestedRedirect.value }).catch(() => {})
  magicLinkSent.value = !magicLink.error.value
  if (magicLinkSent.value) sentTo.value = address
}

const registerPath = useAuthPages().register
// An absolute register URL (e.g. the central frigear.nu sign-up) leaves the app and gets no `?redirect=`.
const registerExternal = !!registerPath && /^https?:\/\//.test(registerPath)
const registerLink = computed(() => registerPath
  ? (registerExternal || !requestedRedirect.value ? registerPath : `${registerPath}?redirect=${encodeURIComponent(requestedRedirect.value)}`)
  : undefined)
const forgotPasswordEnabled = useRuntimeConfig().public.authentication?.passwordReset === true

async function onSubmit(payload: { data: { email: string, password: string } }) {
  if (magicLinkOnly.value) return sendLink(payload.data.email)
  magicLink.error.value = null
  await login(payload.data)
  await afterLogin()
}

const formError = computed(() => magicLink.error.value || error.value)

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
      v-else-if="unverifiedEmail"
      color="error"
      variant="subtle"
      :title="t('errors.signIn.unverifiedEmail', 'The account you signed in with has not verified this email address. Verify it there, or sign in another way.')"
    />
    <UAlert
      v-else-if="stateMismatch"
      color="error"
      variant="subtle"
      :title="t('errors.signIn.oauthState', 'The sign-in could not be completed. Start it again from this page.')"
    />
    <UAlert
      v-else-if="requestedRedirect"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      :title="signInReason.title"
      :description="signInReason.description"
    />

    <UAlert
      v-if="handoff.pending.value"
      color="neutral"
      variant="subtle"
      icon="i-lucide-external-link"
      :title="t('handoff.waiting.title', 'Finish signing in in your browser')"
      :description="t('handoff.waiting.description', 'frigear.nu opened in your browser. Sign in there, and this window continues by itself.')"
      :actions="[
        { label: t('handoff.reopen', 'Open the browser again'), color: 'neutral', variant: 'outline', onClick: () => handoff.reopen() },
        { label: t('handoff.cancel', 'Cancel sign-in'), color: 'neutral', variant: 'ghost', onClick: () => handoff.cancel() },
      ]"
    />
    <UAlert
      v-else-if="handoffError"
      color="error"
      variant="subtle"
      :title="handoffError"
    />

    <UAuthForm
      ref="authForm"
      :fields="fields"
      :providers="providers"
      :separator="t('or', 'or')"
      :loading="magicLinkOnly ? magicLink.pending.value : pending"
      :submit="{ label: magicLinkOnly ? t('magicLink.submit', 'Send link') : t('signIn', 'Log in'), block: true }"
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
        v-if="magicLinkSent"
        #submit
      >
        <UButton
          v-if="passwordLoginEnabled"
          type="submit"
          :label="t('signIn', 'Log in')"
          :loading="pending"
          block
        />
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-mail-check"
          :title="t('magicLink.sentTitle', 'Check your inbox')"
          :description="t('magicLink.sentTo', 'If there is an account for {email}, a sign-in link is on its way. It works once and expires after 2 hours.', { email: sentTo })"
          :actions="[{ label: t('magicLink.sendAgain', 'Send the link again'), color: 'success', variant: 'outline', loading: magicLink.pending.value, onClick: () => sendLink(sentTo) }]"
        />
      </template>
      <template
        v-else-if="magicLinkExtra"
        #submit
      >
        <div class="flex flex-col gap-2">
          <UButton
            type="submit"
            :label="t('signIn', 'Log in')"
            :loading="pending"
            block
          />
          <UButton
            :label="t('magicLink.send', 'Email me a sign-in link')"
            icon="i-lucide-mail"
            color="neutral"
            variant="outline"
            :loading="magicLink.pending.value"
            block
            @click="sendLink(authForm?.state.email)"
          />
        </div>
      </template>
      <template
        v-if="formError"
        #validation
      >
        <UAlert
          color="error"
          variant="subtle"
          :title="formError"
        />
      </template>
    </UAuthForm>
  </AuthCard>
</template>
