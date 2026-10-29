<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Translated } from '../../../types'
import type { StaffEventSummary } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminPage' })

const t = useModuleT('events')
const tr = useEventsTranslate()
const format = useFormat()
const links = useEventLinks()
const actions = useEventActions()
const { data: events, status, error, refresh } = await useFetch<StaffEventSummary[]>('/api/events/admin/events')

const rows = computed(() => events.value ?? [])
const loading = computed(() => status.value === 'pending' && !events.value)
const refreshing = computed(() => status.value === 'pending' && !!events.value)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

// The whole list is loaded at once, so search runs on the client: every language of the name and the location.
const search = ref('')
const texts = (value: Translated | null | undefined) => !value ? [] : typeof value === 'string' ? [value] : Object.values(value)
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return rows.value
  return rows.value.filter(row => [...texts(row.name), ...texts(row.location)].some(text => text.toLowerCase().includes(query)))
})

const { sorting, header } = useTableSort({ id: 'startsAt', desc: true })

const StatusBadge = resolveComponent('StatusBadge')
const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')

const columns = computed<TableColumn<StaffEventSummary>[]>(() => [
  {
    id: 'name',
    accessorFn: row => tr(row.name),
    header: header('name', t('admin.name', 'Name')),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name), description: tr(row.original.location) }),
  },
  {
    accessorKey: 'status',
    header: header('status', t('admin.status', 'Status')),
    cell: ({ row }) => h(StatusBadge, { status: row.original.status, label: t(`admin.statuses.${row.original.status}`, row.original.status) }),
  },
  {
    accessorKey: 'startsAt',
    header: header('startsAt', t('admin.starts', 'Starts')),
    cell: ({ row }) => row.original.startsAt ? h('span', { class: 'tabular-nums' }, format.dateTime(row.original.startsAt)) : emptyCell(),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onRemoved: refresh }), subject: tr(row.original.name) }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'Events')"
      :description="t('admin.listDescription', 'Events, their ticket types and attendees.')"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.create', 'New event')"
          @click="actions.create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !events"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to events') : t('admin.loadFailed', 'Events could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('admin.search', 'Search events')"
          :aria-label="t('admin.search', 'Search events')"
          class="w-full sm:max-w-xs"
        />
      </PageToolbar>

      <TableCard
        :loading="loading"
        :refreshing="refreshing"
      >
        <UTable
          v-model:sorting="sorting"
          :data="filtered"
          :columns="columns"
          :ui="tableUi()"
          @select="(_: Event, row: { original: StaffEventSummary }) => navigateTo(links.adminEvent(row.original.id))"
        >
          <template #empty>
            <UEmpty
              v-if="rows.length"
              variant="naked"
              icon="i-lucide-search"
              :title="t('admin.noMatches', 'No events match your search')"
              :actions="[{ label: t('admin.clearSearch', 'Clear search'), color: 'neutral', variant: 'outline', onClick: () => { search = '' } }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-calendar"
              :title="t('admin.empty', 'No events yet')"
              :description="t('admin.emptyDescription', 'Create the first event to start selling tickets.')"
              :actions="[{ label: t('admin.create', 'New event'), icon: 'i-lucide-plus', onClick: () => actions.create() }]"
            />
          </template>
        </UTable>
      </TableCard>
    </template>
  </div>
</template>
