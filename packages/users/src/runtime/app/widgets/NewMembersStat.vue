<script setup lang="ts">
defineOptions({ name: 'UsersNewMembersStat' })

// Stat card for the `admin.dashboard.top` area: sign-ups of the last 30 days, with the total as context.
const t = useModuleT('users')
const adminPage = useRuntimeConfig().public.users?.pages?.admin
const { data: stats, status } = useLazyFetch<{ total: number, newMembers: number, days: number }>('/api/admin/users/stats', { key: 'admin-users-stats' })
</script>

<template>
  <AdminStatCard
    :label="t('admin.stats.newMembers', 'New members')"
    icon="i-lucide-user-plus"
    :to="adminPage"
    :loading="status === 'pending' && !stats"
  >
    <template v-if="stats">
      <span>{{ stats.newMembers }}</span>
      <span class="text-muted text-sm font-normal">{{ t('admin.stats.ofTotal', '{total} users in total').replace('{total}', String(stats.total)) }}</span>
    </template>
  </AdminStatCard>
</template>
