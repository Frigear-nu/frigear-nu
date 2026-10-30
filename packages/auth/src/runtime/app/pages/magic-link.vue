<script setup lang="ts">
import { authApi } from '../../utils/api'
import { isAppPage } from '../utils/after-login'
import { $fetch, computed, navigateTo, ref, useAuthPages, useModuleT, useRoute, useRouter, useUserSession } from '#imports'

defineOptions({ name: 'AuthMagicLinkPage' })

// The emailed sign-in (or verification) link lands here. Opening it changes nothing: mail scanners and link previews
// follow links, so only the button below uses the link up (POST).
const t = useModuleT('auth')
const route = useRoute()
const router = useRouter()
const { loggedIn, user, fetch: refreshSession } = useUserSession()
const loginPath = useAuthPages().login

const code = computed(() => typeof route.query.code === 'string' ? route.query.code : '')
const pending = ref(false)
const invalid = ref(!code.value)
const error = ref<string | null>(null)
const signedInEmail = computed(() => (user.value as { email?: string } | null)?.email ?? '')

const isInternalPath = (value: string) => value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')

async function onContinue() {
  pending.value = true
  error.value = null

  try {
    const { redirect } = await $fetch<{ redirect: string }>(authApi.magicLinkConfirm, {
      method: 'POST',
      body: { code: code.value },
    })
    await refreshSession()
    const target = isInternalPath(redirect) ? redirect : '/'
    // Targets like `/oauth/authorize?...` are server routes and need a full page navigation.
    await navigateTo(target, { external: !isAppPage(router.resolve(target).matched) })
  }
  catch (err) {
    if ((err as { statusCode?: number })?.statusCode === 400) invalid.value = true
    else error.value = t('magicLink.continue.failed', 'Something went wrong. Try again.')
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthCard
    :title="t('magicLink.continue.title', 'Continue signing in')"
    :description="invalid ? undefined : t('magicLink.continue.description', 'Finish signing in with the link we emailed you. This also confirms your e-mail address.')"
  >
    <UAlert
      v-if="invalid"
      color="error"
      variant="subtle"
      :title="t('magicLink.invalid', 'This sign-in link is invalid or has expired.')"
      :description="t('magicLink.continue.invalidHint', 'Links can be used once and expire after 2 hours. Request a new one from the log in page.')"
    />

    <template v-else>
      <UAlert
        v-if="loggedIn && signedInEmail"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="t('magicLink.continue.signedIn', 'You are signed in as {email}. Continuing signs you in with the account this link was sent to.', { email: signedInEmail })"
      />
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="error"
      />
      <UButton
        block
        :loading="pending"
        :label="t('magicLink.continue.submit', 'Continue signing in')"
        @click="onContinue"
      />
    </template>

    <template #footer>
      <ULink
        :to="loginPath"
        class="font-medium text-primary"
      >
        {{ t('backToSignIn', 'Back to log in') }}
      </ULink>
    </template>
  </AuthCard>
</template>
