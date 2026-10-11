<script setup lang="ts">
defineOptions({ name: 'UsersResetPasswordPage' })

const t = useModuleT('auth')
const { resetPassword, pending, error } = useUserPasswordReset()
const loginPath = useRuntimeConfig().public.users?.pages?.login || '/login'
const code = computed(() => {
  const value = useRoute().query.code
  return typeof value === 'string' ? value : ''
})

const fields = computed(() => [
  { name: 'password', type: 'password' as const, label: t('resetPassword.new.label', 'New password'), required: true },
  { name: 'confirmPassword', type: 'password' as const, label: t('resetPassword.confirm.label', 'Confirm new password'), required: true },
])

async function onSubmit(payload: { data: { password: string, confirmPassword: string } }) {
  await resetPassword({ code: code.value, ...payload.data })
  await navigateTo('/')
}
</script>

<template>
  <UsersAuthCard
    :title="t('resetPassword.title', 'Reset password')"
    icon="i-lucide-lock-keyhole"
  >
    <UAlert
      v-if="!code"
      color="error"
      variant="subtle"
      :title="t('resetPassword.invalid', 'This reset link is invalid or has expired.')"
    />
    <UAuthForm
      v-else
      :fields="fields"
      :loading="pending"
      :submit="{ label: t('resetPassword.title', 'Reset password'), block: true }"
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
