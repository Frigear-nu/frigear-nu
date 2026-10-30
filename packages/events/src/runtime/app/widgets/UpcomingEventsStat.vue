<script setup lang="ts">
import type { UpcomingEventsDto } from '../../../types'
import { eventsApi } from '../../utils/api'
import { useEventLinks, useLazyFetch, useModuleT } from '#imports'

defineOptions({ name: 'EventsUpcomingStat' })

// Stat card for the `admin.dashboard.top` area: how many published events are still to come.
const t = useModuleT('events')
const links = useEventLinks()
const { data, status } = useLazyFetch<UpcomingEventsDto>(eventsApi.admin.upcoming, { key: 'admin-events-upcoming' })
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
