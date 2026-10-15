<script setup lang="ts">
defineOptions({ name: 'UsersNewUsersStat' })

// Stat card for the `admin.dashboard.top` area: sign-ups of the last 30 days, with the total as context.
const t = useModuleT('users')
const { localize } = useLocaleLink()
const adminPage = useRuntimeConfig().public.users?.pages?.admin
const { data: stats, status } = useLazyFetch<{ total: number, newUsers: number, days: number }>('/api/admin/users/stats', { key: 'admin-users-stats' })
</script>

<template>
  <StatCard
    :label="t('admin.stats.newUsers', 'New users')"
    icon="i-lucide-user-plus"
    :value="stats?.newUsers"
    :hint="stats ? t('admin.stats.ofTotal', '{total} users in total', { total: stats.total }) : undefined"
    :to="adminPage ? localize(adminPage) : undefined"
    :loading="status === 'pending' && !stats"
  />
</template>
