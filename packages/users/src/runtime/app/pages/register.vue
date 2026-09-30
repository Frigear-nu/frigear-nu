<script setup lang="ts">
defineOptions({ name: 'UsersRegisterPage' })

const { register, pending, error } = useAuthRegister()

const name = ref('')
const email = ref('')
const password = ref('')

async function onSubmit() {
  await register({ name: name.value, email: email.value, password: password.value })
  await navigateTo('/')
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <h1>Register</h1>
    <p v-if="error">
      {{ error }}
    </p>
    <label>
      Name
      <input
        v-model="name"
        type="text"
        name="name"
        autocomplete="name"
        required
      >
    </label>
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
        autocomplete="new-password"
        required
        minlength="8"
      >
    </label>
    <button
      type="submit"
      :disabled="pending"
    >
      Register
    </button>
  </form>
</template>
