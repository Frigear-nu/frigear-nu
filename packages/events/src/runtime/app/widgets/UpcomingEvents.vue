<script setup lang="ts">
import type { Translated } from '../../../types'

defineOptions({ name: 'EventsUpcomingList' })

// List card for the `admin.dashboard.side` area: the next published events.
type Upcoming = { id: string, name: Translated, location: Translated | null, startsAt: string }

const t = useModuleT('events')
const locale = useEventsLocale()
const tr = useEventsTranslate()
const pages = useRuntimeConfig().public.events?.pages
const { data, status } = useLazyFetch<{ total: number, items: Upcoming[] }>('/api/events/admin/upcoming', { key: 'admin-events-upcoming' })

const eventTo = (id: string) => (pages?.adminEvent || '/admin/events/:id').replace(':id', encodeURIComponent(id))
const when = (value: string) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
</script>

<template>
  <AdminListCard
    :title="t('admin.upcoming.title', 'Upcoming events')"
    :loading="status === 'pending' && !data"
    :is-empty="!data?.items.length"
    :empty="t('admin.upcoming.empty', 'No upcoming events.')"
    :to="pages?.admin"
    :to-label="t('admin.upcoming.all', 'All events')"
  >
    <li
      v-for="item in data?.items"
      :key="item.id"
      class="min-w-0"
    >
      <NuxtLink
        :to="eventTo(item.id)"
        class="text-highlighted block truncate font-medium hover:underline"
      >
        {{ tr(item.name) }}
      </NuxtLink>
      <p class="text-muted truncate text-xs">
        {{ when(item.startsAt) }}<template v-if="item.location">
          · {{ tr(item.location) }}
        </template>
      </p>
    </li>
  </AdminListCard>
</template>
