<script setup lang="ts">
// Overrides the account header block of @frigear-nu/account to add the Frigear ID.
const t = useModuleT('account')
const { user } = useUserSession()
</script>

<template>
  <div
    v-if="user"
    class="flex flex-col"
  >
    <div class="text-sm text-muted">
      {{ t('signedInAs', 'Signed in as') }}
    </div>
    <div class="text-primary">
      {{ user.email }}
    </div>
    <div class="mt-1 flex justify-end">
      <UBadge variant="soft">
        Frigear ID: <code>{{ user.id }}</code>
      </UBadge>
    </div>
  </div>
</template>
