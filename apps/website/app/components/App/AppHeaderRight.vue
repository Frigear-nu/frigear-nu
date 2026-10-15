<script lang="ts" setup>
// This file overrides the base layer component with the same name.
const { loggedIn } = useUserSession()
const { login: loginPath } = useAuthPages()
const t = useModuleT('auth')
const { localize } = useLocaleLink()
</script>

<template>
  <AccountMenu v-if="loggedIn" />
  <UButton
    v-else
    :to="localize(loginPath)"
    icon="i-lucide-log-in"
    :label="t('signIn', 'Sign in')"
  />
</template>
