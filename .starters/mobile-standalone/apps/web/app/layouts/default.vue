<script setup lang="ts">
// The site header on every page except /admin, which has its own shell. The account menu (@frigear-nu/account) lists
// the dashboard, the account pages, the admin for admins, and sign out.
const { loggedIn } = useUserSession()
</script>

<template>
  <div>
    <UHeader
      title="Your new Frigear app"
      to="/"
      :toggle="false"
    >
      <template #right>
        <AccountMenu v-if="loggedIn" />
        <UButton
          v-else
          to="/login"
          icon="i-lucide-log-in"
          label="Sign in"
        />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
