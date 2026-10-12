<script setup lang="ts">
defineOptions({ name: 'UsersAdminCurrentSubscription' })

// Summary card for the `admin.users.overview` widget area of the admin user page (`@frigear-nu/users`).
defineProps<{ user: { subscription?: { planKey: string | null, status: string } | null } }>()

const t = useModuleT('subscriptions.admin')
</script>

<template>
  <AdminStatCard
    :label="t('currentSubscription', 'Current subscription')"
    :empty="t('none', 'No active membership.')"
  >
    <template v-if="user.subscription">
      <UBadge
        variant="subtle"
        :color="['active', 'trialing'].includes(user.subscription.status) ? 'success' : 'neutral'"
        :label="user.subscription.planKey ?? user.subscription.status"
      />
      <span class="text-muted">{{ user.subscription.status }}</span>
    </template>
  </AdminStatCard>
</template>
