<script setup lang="ts">
defineOptions({ name: 'UsersForgotPasswordPage' })

const t = useModuleT('auth')
const { requestReset, pending, error } = useUserPasswordReset()
const loginPath = useRuntimeConfig().public.users?.pages?.login || '/login'
const sent = ref(false)

const fields = computed(() => [
  { name: 'email', type: 'text' as const, label: t('email.label', 'Email'), required: true },
])

async function onSubmit(payload: { data: { email: string } }) {
  await requestReset(payload.data)
  sent.value = true
}
</script>

<template>
  <UsersAuthCard
    :title="t('forgotPassword.title', 'Forgot password?')"
    :description="sent
      ? t('email.sent.description', 'We have sent you an e-mail. Check your inbox or spam.')
      : t('forgotPassword.description', 'Enter your e-mail and we will send you a link to set a new password.')"
  >
    <UAuthForm
      v-if="!sent"
      :fields="fields"
      :loading="pending"
      :submit="{ label: t('forgotPassword.submit', 'Send reset link'), block: true }"
      @submit="onSubmit"
    >
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

    <template #footer>
      <ULink
        :to="loginPath"
        class="font-medium text-primary"
      >
        {{ t('backToSignIn', 'Back to log in') }}
      </ULink>
    </template>
  </UsersAuthCard>
</template>
