<script setup lang="ts">
defineOptions({ name: 'EventsUpcomingStat' })

// Stat card for the `admin.dashboard.top` area: how many published events are still to come.
const t = useModuleT('events')
const pages = useRuntimeConfig().public.events?.pages
const { data, status } = useLazyFetch<{ total: number }>('/api/events/admin/upcoming', { key: 'admin-events-upcoming' })
</script>

<template>
  <AdminStatCard
    :label="t('admin.upcoming.stat', 'Upcoming events')"
    icon="i-lucide-calendar-days"
    :to="pages?.admin"
    :loading="status === 'pending' && !data"
  >
    <span v-if="data">{{ data.total }}</span>
  </AdminStatCard>
</template>
