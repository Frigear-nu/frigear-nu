<script setup lang="ts">
defineOptions({ name: 'UsersRegisterPage' })

const t = useModuleT('auth')
const { register, pending, error } = useUserRegistration()

const fields = computed(() => [
  { name: 'name', type: 'text' as const, label: t('name.label', 'Name'), required: true },
  { name: 'email', type: 'text' as const, label: t('email.label', 'Email'), required: true },
  { name: 'password', type: 'password' as const, label: t('password.label', 'Password'), required: true },
])

async function onSubmit(payload: { data: { name: string, email: string, password: string } }) {
  await register(payload.data)
  await navigateTo('/')
}
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UAuthForm
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
