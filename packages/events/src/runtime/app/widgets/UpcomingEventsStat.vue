<script setup lang="ts">
defineOptions({ name: 'EventsUpcomingStat' })

// Stat card for the `admin.dashboard.top` area: how many published events are still to come.
const t = useModuleT('events')
const links = useEventLinks()
const { data, status } = useLazyFetch<{ total: number }>('/api/events/admin/upcoming', { key: 'admin-events-upcoming' })
</script>

<template>
  <StatCard
    :label="t('admin.upcoming.stat', 'Upcoming events')"
    icon="i-lucide-calendar-days"
    :to="links.admin()"
    :value="data?.total"
    :loading="status === 'pending' && !data"
  />
</template>
