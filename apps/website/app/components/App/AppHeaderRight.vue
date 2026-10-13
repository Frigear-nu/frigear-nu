<script lang="ts" setup>
// This file overrides the base layer component with the same name.
const { loggedIn } = useUserSession()
const { login: loginPath } = useAuthPages()
</script>

<template>
  <AccountMenu v-if="loggedIn" />
  <UButton
    v-else
    :to="loginPath"
    icon="i-heroicons-arrow-right-on-rectangle"
    label="Login"
  />
</template>
