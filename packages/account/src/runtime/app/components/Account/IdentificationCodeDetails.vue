<script setup lang="ts">
// Extension point: shown under the Frigear ID QR code. Override it in the host app
// (components/Account/IdentificationCodeDetails.vue) to add membership, roles or anything else.
const { user } = useUserSession()
</script>

<template>
  <UBadge
    v-if="user"
    size="lg"
  >
    Frigear ID: {{ user.id }}
  </UBadge>
</template>
