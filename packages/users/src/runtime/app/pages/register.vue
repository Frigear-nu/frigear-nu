<script setup lang="ts">
defineOptions({ name: 'UsersRegisterPage' })

const t = useModuleT('auth')
const { register, pending, error } = useUserRegistration()

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
  await navigateTo('/')
}
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UAlert
          v-if="verificationSent"
          :title="t('verifyEmail.title', 'Verify your e-mail')"
          :description="t('verifyEmail.description', 'We have sent you an e-mail. Check your inbox or spam.')"
        />
        <UAuthForm
          v-else
          :title="t('signUp', 'Register')"
          :fields="fields"
          :loading="pending"
          :submit="{ label: t('signUp', 'Register') }"
          @submit="onSubmit"
        >
          <template
            v-if="error"
            #validation
          >
            <UAlert
              color="error"
              :title="error"
            />
          </template>
        </UAuthForm>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
