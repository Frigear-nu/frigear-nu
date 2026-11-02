<script setup lang="ts">
import { statusColor, useModuleT } from '#imports'

defineOptions({ name: 'UsersAdminCurrentSubscription' })

// Summary card for the `admin.users.overview` widget area of the admin user page (`@frigear-nu/users`).
defineProps<{ user: { subscription?: { planKey: string | null, status: string } | null } }>()

const t = useModuleT('subscriptions.admin')
</script>

<template>
  <StatCard
    :label="t('currentSubscription', 'Current subscription')"
    icon="i-lucide-badge-check"
    :empty="t('none', 'No active membership.')"
  >
    <template
      v-if="user.subscription"
      #default
    >
      <UBadge
        variant="subtle"
        :color="statusColor(user.subscription.status)"
        :label="user.subscription.planKey ?? user.subscription.status"
      />
      <span class="text-muted text-sm font-normal">{{ user.subscription.status }}</span>
    </template>
  </StatCard>
</template>
