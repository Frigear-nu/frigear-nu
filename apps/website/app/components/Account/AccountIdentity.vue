<script setup lang="ts">
// Overrides `AccountIdentity` of @frigear-nu/account (the details next to the user in the account overview's summary
// card) to show the Frigear ID.
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
