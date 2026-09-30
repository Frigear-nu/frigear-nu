<script setup lang="ts">
defineOptions({ name: 'UsersLoginPage' })

const { login, pending, error, passwordLoginEnabled, oauthProviders } = useUserLogin()

const fields = computed(() => passwordLoginEnabled.value
  ? [
      { name: 'email', type: 'text' as const, label: 'Email', required: true },
      { name: 'password', type: 'password' as const, label: 'Password', required: true },
    ]
  : [])

async function onSubmit(payload: { data: { email: string, password: string } }) {
  await login(payload.data)
  await navigateTo('/')
}
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UAuthForm
          title="Log in"
          :fields="fields"
          :providers="oauthProviders"
          :loading="pending"
          :submit="{ label: 'Log in' }"
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
