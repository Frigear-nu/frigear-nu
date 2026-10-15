<script setup lang="ts">
import type { Translated } from '../../../types'
import AttendeesTab from '../tabs/Attendees.vue'
import DetailsTab from '../tabs/Details.vue'
import TicketsTab from '../tabs/Tickets.vue'
import { type StaffEvent, toLocalInput } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminEventPage' })

const t = useModuleT('events')
const route = useRoute()
const tr = useEventsTranslate()
const links = useEventLinks()
const actions = useEventActions()
const hasPublicPage = !!useRuntimeConfig().public.events?.pages?.event
const id = computed(() => String(route.params.id))
const { busy, run } = useAction()

const { data: event, refresh } = await useFetch<StaffEvent>(() => `/api/events/admin/events/${id.value}`)

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
}, { success: t('admin.saved', 'Saved.') })
</script>

<template>
  <div
    v-if="event"
    class="flex flex-col gap-4"
  >
    <PageHeading
      :title="tr(event.name)"
      :breadcrumb="[{ label: t('admin.title', 'Events'), to: links.admin() }, { label: tr(event.name) }]"
    >
      <template #badge>
        <UBadge
          variant="subtle"
          :color="statusColor(event.status)"
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
            :label="t('admin.saveEvent', 'Save event')"
          />
        </div>
      </template>
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
  </div>
  <UEmpty
    v-else
    icon="i-lucide-calendar-x"
    :title="t('notFound', 'Event not found')"
    :actions="[{ label: t('admin.allEvents', 'All events'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
  />
</template>
