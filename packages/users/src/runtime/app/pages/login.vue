<script setup lang="ts">
defineOptions({ name: 'UsersLoginPage' })

const { login, pending, error } = useAuthLogin()

const email = ref('')
const password = ref('')

async function onSubmit() {
  await login({ email: email.value, password: password.value })
  await navigateTo('/')
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <h1>Log in</h1>
    <p v-if="error">
      {{ error }}
    </p>
    <label>
      Email
      <input
        v-model="email"
        type="email"
        name="email"
        autocomplete="email"
        required
      >
    </label>
    <label>
      Password
      <input
        v-model="password"
        type="password"
        name="password"
        autocomplete="current-password"
        required
      >
    </label>
    <button
      type="submit"
      :disabled="pending"
    >
      Log in
    </button>
  </form>
</template>
