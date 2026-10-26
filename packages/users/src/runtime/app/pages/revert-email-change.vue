<script setup lang="ts">
defineOptions({ name: 'UsersRevertEmailChangePage' })

type Preview = { status: 'pending' | 'reverted' | 'expired', oldEmail: string, newEmail: string }

// The link emailed to the old address after an email change lands here. Opening it changes nothing; the button puts
// the old address back. No sign-in is needed: whoever changed the address may have locked the owner out.
const t = useModuleT('users.emailChange')
const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const loginPath = useAuthPages().login
const passwordReset = useRuntimeConfig().public.authentication?.passwordReset === true

const code = computed(() => typeof route.query.code === 'string' ? route.query.code : '')
const { data: preview, error: previewError } = await useFetch<Preview>('/api/users/email-change/revert', {
  query: { code },
  immediate: !!code.value,
})

const reverting = ref(false)
const restoredEmail = ref<string | null>(null)
const error = ref<string | null>(null)

const state = computed(() => {
  if (restoredEmail.value) return 'done'
  if (!code.value || previewError.value || !preview.value || preview.value.status === 'expired') return 'invalid'
  return preview.value.status === 'reverted' ? 'reverted' : 'revert'
})

async function onRevert() {
  reverting.value = true
  error.value = null

  try {
    const result = await $fetch<{ email: string, signedOut: boolean }>('/api/users/email-change/revert', {
      method: 'POST',
      body: { code: code.value },
    })
    if (result.signedOut) await refreshSession()
    restoredEmail.value = result.email
  }
  catch (err) {
    const status = (err as { statusCode?: number })?.statusCode
    error.value = status === 400
      ? t('revert.invalid', 'This link is invalid or has expired.')
      : status === 409
        ? t('revert.taken', 'Another account now uses your old e-mail address. Contact us to get your account back.')
        : t('revert.failed', 'Could not restore your e-mail address. Try again.')
  }
  finally {
    reverting.value = false
  }
}
</script>

<template>
  <AuthCard :title="t('revert.title', 'Undo e-mail change')">
    <template v-if="state === 'invalid'">
      <UAlert
        color="error"
        variant="subtle"
        :title="t('revert.invalid', 'This link is invalid or has expired.')"
        :description="t('revert.invalidHint', 'The link works once, for 7 days after the change.')"
      />
    </template>

    <template v-else-if="state === 'reverted'">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="t('revert.already', 'This change was already undone.')"
      />
    </template>

    <template v-else-if="state === 'done'">
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="t('revert.done', 'Your e-mail address is {email} again.', { email: restoredEmail ?? '' })"
        :description="passwordReset
          ? t('revert.doneHint', 'Sign in again. If you did not ask for the change, reset your password too.')
          : t('revert.doneHintNoReset', 'Sign in again to continue.')"
      />
      <UButton
        block
        :to="loginPath"
        icon="i-lucide-log-in"
        :label="t('revert.signIn', 'Sign in')"
      />
      <UButton
        v-if="passwordReset"
        block
        color="neutral"
        variant="outline"
        to="/forgot-password"
        :label="t('revert.resetPassword', 'Reset password')"
      />
    </template>

    <template v-else-if="preview">
      <p class="text-center text-sm text-muted">
        {{ t('revert.description', 'The e-mail address of your account was changed to {newEmail}. If that was not you, restore {oldEmail}.', { newEmail: preview.newEmail, oldEmail: preview.oldEmail }) }}
      </p>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="error"
      />
      <UButton
        block
        color="error"
        :loading="reverting"
        :label="t('revert.submit', 'Restore {email}', { email: preview.oldEmail })"
        @click="onRevert"
      />
    </template>
  </AuthCard>
</template>
