<script setup lang="ts">
import type { Translated } from '../../../types'
import AttendeesTab from '../tabs/Attendees.vue'
import DetailsTab from '../tabs/Details.vue'
import TicketsTab from '../tabs/Tickets.vue'
import { type AdminEvent, toLocalInput, useAdminAction } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminEventPage' })

const t = useModuleT('events')
const route = useRoute()
const tr = useEventsTranslate()
const pages = useRuntimeConfig().public.events?.pages
const id = computed(() => String(route.params.id))
const { busy, run } = useAdminAction()

const { data: event, refresh } = await useFetch<AdminEvent>(() => `/api/events/admin/events/${id.value}`)

// The tabs below the key facts are the `admin.events` area: modules add tabs with `extendTabs(nuxt, 'admin.events', ...)`
// and each tab component receives the `event` and may emit `refresh`. `@frigear-nu/widget` is optional; without it
// the built-in tabs render stacked.
const Tabs = resolveComponent('WidgetTabs')
const tabs = typeof Tabs === 'string' ? undefined : Tabs

// The facts staff look at first: status, when, where and the URL. They save on their own, apart from the texts.
const facts = reactive({
  status: 'draft',
  startsAt: '',
  endsAt: '',
  location: undefined as Translated | undefined,
  slug: '',
})
watch(event, (value) => {
  if (!value) return
  Object.assign(facts, {
    status: value.status,
    startsAt: toLocalInput(value.startsAt),
    endsAt: toLocalInput(value.endsAt),
    location: value.location ?? undefined,
    slug: value.slug,
  })
}, { immediate: true })

const statuses = computed(() => ['draft', 'published', 'archived'].map(value => ({ value, label: t(`admin.statuses.${value}`, value.charAt(0).toUpperCase() + value.slice(1)) })))
const statusColor: Record<string, 'success' | 'warning' | 'neutral'> = { draft: 'warning', published: 'success', archived: 'neutral' }

const saveFacts = () => run(async () => {
  await $fetch(`/api/events/admin/events/${id.value}`, {
    method: 'PATCH',
    body: {
      status: facts.status,
      startsAt: facts.startsAt,
      endsAt: facts.endsAt || null,
      location: facts.location ?? null,
      slug: facts.slug,
    },
  })
  await refresh()
}, t('admin.saved', 'Saved.'))
</script>

<template>
  <AdminPage v-if="event">
    <AdminPageHeader
      :title="tr(event.name)"
      :back="{ label: t('admin.title', 'Events'), to: pages?.admin || '/admin/events' }"
    >
      <UBadge
        variant="subtle"
        :color="statusColor[event.status] ?? 'neutral'"
        :label="t(`admin.statuses.${event.status}`, event.status)"
      />
      <template #actions>
        <UButton
          v-if="event.status === 'published' && pages?.event"
          :to="pages.event.replace(':slug', encodeURIComponent(event.slug))"
          variant="outline"
          color="neutral"
          icon="i-lucide-external-link"
          :label="t('admin.viewPublic', 'View public page')"
        />
      </template>
    </AdminPageHeader>

    <AdminSection :title="t('admin.keyFacts', 'Event')">
      <form
        id="admin-event-facts"
        class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        @submit.prevent="saveFacts"
      >
        <UFormField :label="t('admin.status', 'Status')">
          <USelect
            v-model="facts.status"
            :items="statuses"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('admin.starts', 'Starts')">
          <UInput
            v-model="facts.startsAt"
            type="datetime-local"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField :label="t('admin.ends', 'Ends')">
          <UInput
            v-model="facts.endsAt"
            type="datetime-local"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('admin.location', 'Location')">
          <TranslatedInput v-model="facts.location" />
        </UFormField>
        <UFormField :label="t('admin.slug', 'URL name')">
          <UInput
            v-model="facts.slug"
            class="w-full"
            required
          />
        </UFormField>
      </form>
      <template #footer>
        <div class="flex justify-end">
          <UButton
            type="submit"
            form="admin-event-facts"
            :loading="busy"
            :label="t('admin.save', 'Save')"
          />
        </div>
      </template>
    </AdminSection>

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
  </AdminPage>
  <AdminEmpty
    v-else
    icon="i-lucide-calendar-x"
    :title="t('notFound', 'Event not found')"
  />
</template>
