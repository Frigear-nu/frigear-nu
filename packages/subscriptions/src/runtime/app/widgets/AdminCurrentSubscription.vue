<script setup lang="ts">
defineOptions({ name: 'UsersAdminCurrentSubscription' })

// Summary card for the `admin.users.overview` widget area of the admin user page (`@frigear-nu/users`).
defineProps<{ user: { subscription?: { planKey: string | null, status: string } | null } }>()

const t = useModuleT('subscriptions.admin')
</script>

<template>
  <div class="border-default flex flex-col gap-2 rounded-lg border p-4">
    <p class="text-muted text-xs font-medium uppercase">
      {{ t('currentSubscription', 'Current subscription') }}
    </p>
    <div
      v-if="user.subscription"
      class="flex items-center gap-2 text-sm"
    >
      <UBadge
        variant="subtle"
        :color="['active', 'trialing'].includes(user.subscription.status) ? 'success' : 'neutral'"
        :label="user.subscription.planKey ?? user.subscription.status"
      />
      <span class="text-muted">{{ user.subscription.status }}</span>
    </div>
    <p
      v-else
      class="text-muted text-sm"
    >
      {{ t('none', 'No active membership.') }}
    </p>
  </div>
</template>
