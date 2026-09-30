<script setup lang="ts">
defineOptions({ name: 'UsersRegisterPage' })

const { register, pending, error } = useUserRegistration()

const fields = [
  { name: 'name', type: 'text' as const, label: 'Name', required: true },
  { name: 'email', type: 'text' as const, label: 'Email', required: true },
  { name: 'password', type: 'password' as const, label: 'Password', required: true },
]

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
          title="Register"
          :fields="fields"
          :loading="pending"
          :submit="{ label: 'Register' }"
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
