<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffEventSummary } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminPage' })

const t = useModuleT('events')
const tr = useEventsTranslate()
const format = useFormat()
const links = useEventLinks()
const actions = useEventActions()
const { data: events, status, refresh } = await useFetch<StaffEventSummary[]>('/api/events/admin/events', { default: () => [] })

const UBadge = resolveComponent('UBadge')
const RowMenu = resolveComponent('RowMenu')

const columns = computed<TableColumn<StaffEventSummary>[]>(() => [
  { accessorKey: 'name', header: t('admin.name', 'Name'), cell: ({ row }) => tr(row.original.name) },
  {
    accessorKey: 'status',
    header: t('admin.status', 'Status'),
    cell: ({ row }) => h(UBadge, { variant: 'subtle', color: statusColor(row.original.status), label: t(`admin.statuses.${row.original.status}`, row.original.status) }),
  },
  { accessorKey: 'startsAt', header: t('admin.starts', 'Starts'), cell: ({ row }) => format.dateTime(row.original.startsAt) },
  { accessorKey: 'location', header: t('admin.location', 'Location'), cell: ({ row }) => tr(row.original.location) },
  {
    id: 'actions',
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onRemoved: refresh }), subject: tr(row.original.name) }),
  },
])

async function create() {
  const created = await actions.create()
  if (created) await navigateTo(links.adminEvent(created.id))
}
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
          @click="create"
        />
      </template>
    </PageHeading>

    <TableCard :loading="status === 'pending' && !events.length">
      <UTable
        :data="events"
        :columns="columns"
        :ui="tableUi()"
        @select="(_: Event, row: { original: StaffEventSummary }) => navigateTo(links.adminEvent(row.original.id))"
      >
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-lucide-calendar"
            :title="t('admin.empty', 'No events yet')"
            :description="t('admin.emptyDescription', 'Create the first event to start selling tickets.')"
            :actions="[{ label: t('admin.create', 'New event'), icon: 'i-lucide-plus', onClick: create }]"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
