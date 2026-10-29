<script setup lang="ts">
import { usersApi } from '../../utils/api'

defineOptions({ name: 'UsersVerifyEmailChangePage' })

type Preview = {
  status: 'pending' | 'confirmed' | 'expired'
  signedIn: boolean
  owner: boolean
  oldEmail: string
  newEmail: string
}

// The link emailed to the new address lands here. Opening it changes nothing (mail scanners and link previews follow
// links): the account that asked for the change confirms it with the button, signed in.
const t = useModuleT('users.emailChange')
const route = useRoute()
const { loggedIn, user, clear, fetch: refreshSession } = useUserSession()
const loginPath = useAuthPages().login
const profilePath = useRuntimeConfig().public.users?.profilePath

const code = computed(() => typeof route.query.code === 'string' ? route.query.code : '')
const { data: preview, error: previewError } = await useFetch<Preview>(usersApi.emailChange, {
  query: { code },
  immediate: !!code.value,
  // Signing out (wrong account) changes who may confirm.
  watch: [loggedIn],
})

// The sign-in page shows why (`?reason=`, the `users.emailChange.signInReason` strings) and sends them back here.
const signInLink = computed(() => ({ path: loginPath, query: { redirect: route.fullPath, reason: 'users.emailChange' } }))

// Signed out with a link that still works: straight to sign-in. Nothing is used up on the way.
if (preview.value?.status === 'pending' && !loggedIn.value) {
  await navigateTo(signInLink.value)
}
const signedInEmail = computed(() => (user.value as { email?: string } | null)?.email ?? '')

const confirming = ref(false)
const signingOut = ref(false)
const confirmedEmail = ref<string | null>(null)
const error = ref<string | null>(null)

const invalid = computed(() => !code.value || !!previewError.value || preview.value?.status === 'expired')
const state = computed(() => {
  if (confirmedEmail.value) return 'done'
  if (invalid.value || !preview.value) return 'invalid'
  if (preview.value.status === 'confirmed') return 'confirmed'
  if (!loggedIn.value) return 'signed-out'
  return preview.value.owner ? 'confirm' : 'wrong-account'
})

async function onConfirm() {
  confirming.value = true
  error.value = null

  try {
    const result = await $fetch<{ email: string, redirect?: string }>(usersApi.emailChangeConfirm, {
      method: 'POST',
      body: { code: code.value },
    })
    await refreshSession()
    confirmedEmail.value = result.email
    if (result.redirect) await navigateTo(result.redirect)
  }
  catch (err) {
    const status = (err as { statusCode?: number })?.statusCode
    error.value = status === 400
      ? t('invalid', 'This confirmation link is invalid or has expired.')
      : status === 403
        ? t('wrongAccount.title', 'This change belongs to another account')
        : status === 409
          ? t('taken', 'Another account already uses this e-mail address.')
          : t('failed', 'Could not confirm your new e-mail address. Try again.')
  }
  finally {
    confirming.value = false
  }
}

async function onSignOut() {
  signingOut.value = true
  try {
    await clear()
    await navigateTo(signInLink.value)
  }
  finally {
    signingOut.value = false
  }
}
</script>

<template>
  <AuthCard :title="t('verify.title', 'Confirm your new e-mail address')">
    <template v-if="state === 'invalid'">
      <UAlert
        color="error"
        variant="subtle"
        :title="t('invalid', 'This confirmation link is invalid or has expired.')"
        :description="t('invalidHint', 'Links expire after 24 hours. Change your e-mail address again from your profile to get a new one.')"
      />
    </template>

    <template v-else-if="state === 'done'">
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="t('done', 'Your e-mail address is now {email}.', { email: confirmedEmail ?? '' })"
      />
    </template>

    <template v-else-if="state === 'confirmed'">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="t('alreadyConfirmed', 'This e-mail change was already confirmed.')"
      />
    </template>

    <template v-else-if="state === 'signed-out'">
      <p class="text-center text-sm text-muted">
        {{ t('signIn.description', 'To confirm {email} as your new e-mail address, sign in to the account that asked for the change. You come back here afterwards.', { email: preview?.newEmail ?? '' }) }}
      </p>
      <UButton
        block
        :to="signInLink"
        icon="i-lucide-log-in"
        :label="t('signIn.submit', 'Sign in to confirm')"
      />
    </template>

    <template v-else-if="state === 'wrong-account'">
      <UAlert
        color="warning"
        variant="subtle"
        :title="t('wrongAccount.title', 'This change belongs to another account')"
        :description="t('wrongAccount.description', 'You are signed in as {email}. Sign out, then sign in to the account that asked to change its e-mail address.', { email: signedInEmail })"
      />
      <UButton
        block
        color="neutral"
        variant="outline"
        :loading="signingOut"
        icon="i-lucide-log-out"
        :label="t('wrongAccount.signOut', 'Sign out')"
        @click="onSignOut"
      />
    </template>

    <template v-else-if="state === 'confirm' && preview">
      <div class="flex flex-col items-center gap-2 rounded-md border border-default p-4 text-sm">
        <span class="text-muted line-through">{{ preview.oldEmail }}</span>
        <UIcon
          name="i-lucide-arrow-down"
          class="size-4 text-dimmed"
        />
        <span class="font-medium text-highlighted">{{ preview.newEmail }}</span>
      </div>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="error"
      />
      <UButton
        block
        :loading="confirming"
        :label="t('verify.submit', 'Confirm new e-mail address')"
        @click="onConfirm"
      />
    </template>

    <template
      v-if="profilePath && loggedIn"
      #footer
    >
      <ULink
        :to="profilePath"
        class="font-medium text-primary"
      >
        {{ t('backToProfile', 'Back to your profile') }}
      </ULink>
    </template>
  </AuthCard>
</template>
