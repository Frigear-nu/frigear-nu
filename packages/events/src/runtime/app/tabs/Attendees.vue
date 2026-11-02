<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { refDebounced } from '@vueuse/core'
import type { AttendeeDto } from '../../../types'
import type { AttendeesPage, StaffEvent } from '../utils/admin-event'
import { eventsApi } from '../../utils/api'
import { $fetch, computed, emptyCell, errorMessage, h, ref, resolveComponent, tableUi, useAction, useConfirmDialog, useEventsTranslate, useFetch, useFormat, useModuleT, watch } from '#imports'

defineOptions({ name: 'EventsAdminAttendeesTab' })

// The built-in "Attendees" tab of the `admin.events` area: every ticket of the event, with refund and cancel.
type Attendee = AttendeeDto

const props = defineProps<{ event: StaffEvent }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const format = useFormat()
const confirmAction = useConfirmDialog()
const { run } = useAction()

// Paginated on the server. Kept in the tab (not the URL): the page also holds the other tabs.
const page = ref(1)
const pageSize = ref(50)
const search = ref('')
const q = refDebounced(search, 300)
// A new search or page size starts again at page 1.
watch([q, pageSize], () => {
  page.value = 1
})
const query = computed(() => ({ page: page.value, pageSize: pageSize.value, q: q.value.trim() || undefined }))

const { data, status, error, refresh } = await useFetch<AttendeesPage>(() => eventsApi.admin.attendees(props.event.id), { query })
const rows = computed(() => data.value?.items ?? [])
const loading = computed(() => status.value === 'pending' && !data.value)
const refreshing = computed(() => status.value === 'pending' && !!data.value)

const typeName = (ticketTypeId: string) => tr(props.event.ticketTypes.find(item => item.id === ticketTypeId)?.name)
const who = (ticket: Attendee) => ticket.userName || ticket.userEmail || ''

const ticketAction = async (ticket: Attendee, action: 'cancel' | 'refund') => {
  const confirmed = await confirmAction({
    title: action === 'refund' ? t('admin.confirmRefund', 'Refund this ticket?') : t('admin.confirmCancel', 'Cancel this ticket?'),
    description: action === 'refund'
      ? t('admin.confirmRefundDescription', 'The full amount goes back to {name} and the ticket is cancelled.', { name: who(ticket) })
      : t('admin.confirmCancelDescription', 'The ticket of {name} stops working and its seat is freed.', { name: who(ticket) }),
    confirmText: action === 'refund' ? t('admin.refund', 'Refund ticket') : t('admin.cancelTicket', 'Cancel ticket'),
    destructive: true,
  })
  if (!confirmed) return
  return run(async () => {
    await $fetch(action === 'refund' ? eventsApi.admin.refundTicket(ticket.id) : eventsApi.admin.cancelTicket(ticket.id), { method: 'POST' })
    await refresh()
  }, { success: action === 'refund' ? t('admin.refunded', 'Refunded.') : t('admin.cancelled', 'Cancelled.') })
}

// Refund first (it also cancels), then the destructive cancel in its own group.
const menu = (ticket: Attendee): DropdownMenuItem[][] => {
  const refund: DropdownMenuItem[] = ticket.status === 'paid' && ticket.paymentId
    ? [{ label: t('admin.refund', 'Refund ticket'), icon: 'i-lucide-undo-2', onSelect: () => { void ticketAction(ticket, 'refund') } }]
    : []
  const cancel: DropdownMenuItem[] = ticket.status === 'paid' || ticket.status === 'pending'
    ? [{ label: t('admin.cancelTicket', 'Cancel ticket'), icon: 'i-lucide-ban', color: 'error', onSelect: () => { void ticketAction(ticket, 'cancel') } }]
    : []
  return [refund, cancel].filter(group => group.length)
}

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')
const RowMenu = resolveComponent('RowMenu')

const columns = computed<TableColumn<Attendee>[]>(() => [
  {
    accessorKey: 'userName',
    header: t('admin.attendee', 'Attendee'),
    cell: ({ row }) => h(TableIdentity, { title: who(row.original), description: row.original.userName ? row.original.userEmail : null }),
  },
  {
    accessorKey: 'ticketTypeId',
    header: t('admin.ticketType', 'Ticket'),
    cell: ({ row }) => typeName(row.original.ticketTypeId) || emptyCell(),
  },
  {
    accessorKey: 'status',
    header: t('admin.status', 'Status'),
    cell: ({ row }) => h(StatusBadge, { status: row.original.status, label: t(`tickets.status.${row.original.status}`, row.original.status) }),
  },
  {
    accessorKey: 'checkedInAt',
    header: t('admin.checkedIn', 'Checked in'),
    cell: ({ row }) => row.original.checkedInAt ? h('span', { class: 'tabular-nums' }, format.dateTime(row.original.checkedInAt)) : emptyCell(),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => {
      const items = menu(row.original)
      return items.length ? h(RowMenu, { items, subject: who(row.original) }) : null
    },
  },
])
</script>

<template>
  <TableCard
    :title="t('admin.attendees', 'Attendees')"
    :loading="loading"
    :refreshing="refreshing"
  >
    <template #actions>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="sm"
        :placeholder="t('admin.searchAttendees', 'Search name or email')"
        :aria-label="t('admin.searchAttendees', 'Search name or email')"
        class="w-full sm:max-w-xs"
      />
    </template>
    <UEmpty
      v-if="error && !data"
      variant="naked"
      icon="i-lucide-circle-alert"
      :title="t('admin.attendeesLoadFailed', 'Attendees could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UTable
      v-else
      :data="rows"
      :columns="columns"
      :ui="tableUi({ tr: '' })"
    >
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-lucide-users"
          :title="t('admin.noAttendees', 'No tickets yet.')"
        />
      </template>
    </UTable>
    <template #footer>
      <TablePagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :page-sizes="[50, 100]"
        :total="data?.total ?? 0"
      />
    </template>
  </TableCard>
</template>
