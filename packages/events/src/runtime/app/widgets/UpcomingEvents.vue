<script setup lang="ts">
import type { UpcomingEventsDto } from '../../../types'
import { eventsApi } from '../../utils/api'
import { useEventLinks, useEventsTranslate, useFormat, useLazyFetch, useModuleT } from '#imports'

defineOptions({ name: 'EventsUpcomingList' })

// List card for the `admin.dashboard.side` area: the next published events.

const t = useModuleT('events')
const format = useFormat()
const tr = useEventsTranslate()
const links = useEventLinks()
const { data, status } = useLazyFetch<UpcomingEventsDto>(eventsApi.admin.upcoming, { key: 'admin-events-upcoming' })
</script>

<template>
  <ListCard
    :title="t('admin.upcoming.title', 'Upcoming events')"
    :loading="status === 'pending' && !data"
    :is-empty="!data?.items.length"
    :empty="t('admin.upcoming.empty', 'No upcoming events.')"
    :to="links.admin()"
    :to-label="t('admin.upcoming.all', 'All events')"
  >
    <li
      v-for="item in data?.items"
      :key="item.id"
      class="min-w-0"
    >
      <NuxtLink
        :to="links.adminEvent(item.id)"
        class="text-highlighted block truncate font-medium hover:underline"
      >
        {{ tr(item.name) }}
      </NuxtLink>
      <p class="text-muted truncate text-xs">
        {{ format.dateTime(item.startsAt) }}<template v-if="item.location">
          · {{ tr(item.location) }}
        </template>
      </p>
    </li>
  </ListCard>
</template>
