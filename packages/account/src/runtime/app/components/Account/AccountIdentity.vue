<script setup lang="ts">
import { computed, useUserSession } from '#imports'
// Details shown next to the signed-in user in the overview's summary card: the role as a badge for anyone who is not a
// plain `user`, otherwise nothing. Override it in the host app (`components/Account/AccountIdentity.vue`) to show other
// details, e.g. a member number or an ID badge.
const { user } = useUserSession()

const role = computed(() => (user.value as { role?: string | null } | null)?.role || undefined)
const roleLabel = computed(() => role.value && role.value !== 'user'
  ? role.value.charAt(0).toUpperCase() + role.value.slice(1)
  : undefined)
</script>

<template>
  <UBadge
    v-if="roleLabel"
    variant="subtle"
    :label="roleLabel"
  />
</template>
