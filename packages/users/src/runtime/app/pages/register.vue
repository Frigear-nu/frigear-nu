<script setup lang="ts">
import { computed, ref } from 'vue'

defineOptions({ name: 'UsersRegisterPage' })

const t = useModuleT('auth')
const { register, pending, error } = useUserRegistration()
const loginPath = useRuntimeConfig().public.users?.pages?.login || '/login'

// Only same-origin absolute paths are followed, never `//host` or full URLs.
const redirectTarget = computed(() => {
  const target = useRoute().query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
})
const loginLink = computed(() => redirectTarget.value === '/'
  ? loginPath
  : `${loginPath}?redirect=${encodeURIComponent(redirectTarget.value)}`)

const fields = computed(() => [
  { name: 'name', type: 'text' as const, label: t('name.label', 'Name'), required: true },
  { name: 'email', type: 'text' as const, label: t('email.label', 'Email'), required: true },
  { name: 'password', type: 'password' as const, label: t('password.label', 'Password'), required: true },
])

// With `verifyEmail` no session is created: the emailed link verifies the address and signs the user in.
const verificationSent = ref(false)

async function onSubmit(payload: { data: { name: string, email: string, password: string } }) {
  const result = await register(payload.data)
  if (result?.verificationRequired) {
    verificationSent.value = true
    return
  }
  await navigateTo(redirectTarget.value, { external: redirectTarget.value !== '/' })
}
</script>

<template>
  <UsersAuthCard
    :title="verificationSent ? t('verifyEmail.title', 'Verify your e-mail') : t('signUp', 'Sign up')"
    :description="verificationSent ? t('verifyEmail.description', 'We have sent you an e-mail. Check your inbox or spam.') : undefined"
  >
    <UAuthForm
      v-if="!verificationSent"
      :fields="fields"
      :loading="pending"
      :submit="{ label: t('signUp', 'Sign up'), block: true }"
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

    <template
      v-if="!verificationSent"
      #description
    >
      {{ t('alreadyHaveAnAccount', 'Already have an account? ➜') }}
      <ULink
        :to="loginLink"
        class="font-medium text-primary"
      >
        {{ t('signIn', 'Log in') }}
      </ULink>.
    </template>
  </UsersAuthCard>
</template>
