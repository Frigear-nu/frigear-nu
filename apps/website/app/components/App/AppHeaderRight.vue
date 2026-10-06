<script lang="ts" setup>
// This file overrides the base layer component with the same name.
const { loggedIn } = useUserSession()
</script>

<template>
  <AccountMenu v-if="loggedIn" />
  <UButton
    v-else
    :to="$config.public.users?.pages?.login || '/login'"
    icon="i-heroicons-arrow-right-on-rectangle"
    label="Login"
  />
</template>
