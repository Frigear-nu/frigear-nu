<script setup lang="ts">
import AttendeesTab from '../tabs/Attendees.vue'
import DetailsTab from '../tabs/Details.vue'
import TicketsTab from '../tabs/Tickets.vue'
import type { StaffEvent } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminEventPage' })

const t = useModuleT('events')
const route = useRoute()
const tr = useEventsTranslate()
const format = useFormat()
const links = useEventLinks()
const actions = useEventActions()
const hasPublicPage = !!useRuntimeConfig().public.events?.pages?.event
const id = computed(() => String(route.params.id))

const { data: event, error, refresh } = await useFetch<StaffEvent>(() => `/api/events/admin/events/${id.value}`)
const notFound = computed(() => error.value?.statusCode === 404)

// The tabs below the key facts are the `admin.events` area: modules add tabs with `extendTabs(nuxt, 'admin.events', ...)`
// and each tab component receives the `event` and may emit `refresh`. `@frigear-nu/widget` is optional; without it
// the built-in tabs render stacked.
const Tabs = resolveComponent('WidgetTabs')
const tabs = typeof Tabs === 'string' ? undefined : Tabs

// What staff look at first, read-only: the event has one form, in the "Details" tab.
const facts = computed(() => event.value
  ? [
      { key: 'startsAt', label: t('admin.starts', 'Starts'), value: format.dateTime(event.value.startsAt) },
      { key: 'endsAt', label: t('admin.ends', 'Ends'), value: event.value.endsAt ? format.dateTime(event.value.endsAt) : null },
      { key: 'location', label: t('admin.location', 'Location'), value: tr(event.value.location) },
      { key: 'slug', label: t('admin.slug', 'URL name'), value: event.value.slug },
    ]
  : [])
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="event">
      <PageHeading
        :title="tr(event.name)"
        :breadcrumb="[{ label: t('admin.title', 'Events'), to: links.admin() }, { label: tr(event.name) }]"
      >
        <template #badge>
          <StatusBadge
            :status="event.status"
            :label="t(`admin.statuses.${event.status}`, event.status)"
          />
        </template>
        <template #actions>
          <UButton
            v-if="event.status === 'published' && hasPublicPage"
            :to="links.event(event.slug)"
            variant="outline"
            color="neutral"
            icon="i-lucide-external-link"
            :label="t('admin.viewPublic', 'View public page')"
          />
          <RowMenu
            variant="outline"
            :subject="tr(event.name)"
            :items="actions.menu(event, { open: false, viewPublic: false, onRemoved: () => navigateTo(links.admin()) })"
          />
        </template>
      </PageHeading>

      <SectionCard :title="t('admin.keyFacts', 'Event')">
        <DescriptionList :items="facts" />
      </SectionCard>

      <component
        :is="tabs"
        v-if="tabs"
        name="admin.events"
        :context="{ event }"
        @refresh="refresh"
      />
      <template v-else>
        <DetailsTab
          :event="event"
          @refresh="refresh"
        />
        <TicketsTab
          :event="event"
          @refresh="refresh"
        />
        <AttendeesTab
          :event="event"
          @refresh="refresh"
        />
      </template>
    </template>

    <UEmpty
      v-else-if="notFound || !error"
      icon="i-lucide-calendar-x"
      :title="t('notFound', 'Event not found')"
      :actions="[{ label: t('admin.allEvents', 'All events'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else
      icon="i-lucide-circle-alert"
      :title="t('admin.eventLoadFailed', 'The event could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
