<script setup lang="ts">
// Extension point: the Frigear ID mark in the account header. Override it in the host app
// (components/Account/IdentificationBadge.vue), or make it render nothing to hide it.
const { user } = useUserSession()
</script>

<template>
  <UBadge
    v-if="user"
    variant="soft"
  >
    Frigear ID: <code>{{ user.id }}</code>
  </UBadge>
</template>
