<script setup lang="ts">
// The right-hand block of the account header. Override it in the host app
// (components/Account/AccountHeaderRight.vue) to show other details, e.g. a member or Frigear ID badge.
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
  </div>
</template>
