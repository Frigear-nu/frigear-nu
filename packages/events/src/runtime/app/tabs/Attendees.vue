<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { StaffEvent } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminAttendeesTab' })

// The built-in "Attendees" tab of the `admin.events` area: every ticket of the event, with refund and cancel.
type Attendee = {
  id: string
  ticketTypeId: string
  status: string
  amount: number
  currency: string
  paymentId: string | null
  checkedInAt: string | null
  userName: string | null
  userEmail: string | null
}

const props = defineProps<{ event: StaffEvent }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const format = useFormat()
const confirmAction = useConfirmDialog()
const { run } = useAction()

const { data: attendees, refresh } = await useFetch<Attendee[]>(() => `/api/events/admin/events/${props.event.id}/tickets`, { default: () => [] })

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
    await $fetch(`/api/events/admin/tickets/${ticket.id}/${action}`, { method: 'POST' })
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

const columns = computed<TableColumn<Attendee>[]>(() => [
  { accessorKey: 'userName', header: t('admin.attendee', 'Attendee') },
  { accessorKey: 'ticketTypeId', header: t('admin.ticketType', 'Ticket') },
  { accessorKey: 'status', header: t('admin.status', 'Status') },
  { accessorKey: 'checkedInAt', header: t('admin.checkedIn', 'Checked in') },
  { id: 'actions' },
])
</script>

<template>
  <SectionCard
    :title="t('admin.attendees', 'Attendees')"
    flush
  >
    <UTable
      :data="attendees"
      :columns="columns"
      :ui="tableUi({ tr: '' })"
    >
      <template #userName-cell="{ row }">
        <span class="text-highlighted font-medium">{{ row.original.userName }}</span>
        <span class="text-muted"> · {{ row.original.userEmail }}</span>
      </template>
      <template #ticketTypeId-cell="{ row }">
        {{ typeName(row.original.ticketTypeId) }}
      </template>
      <template #status-cell="{ row }">
        <UBadge
          variant="subtle"
          :color="statusColor(row.original.status)"
          :label="t(`tickets.status.${row.original.status}`, row.original.status)"
        />
      </template>
      <template #checkedInAt-cell="{ row }">
        <span v-if="row.original.checkedInAt">{{ format.dateTime(row.original.checkedInAt) }}</span>
        <span
          v-else
          class="text-muted"
        >–</span>
      </template>
      <template #actions-cell="{ row }">
        <RowMenu
          v-if="menu(row.original).length"
          :items="menu(row.original)"
          :subject="who(row.original)"
        />
      </template>
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-lucide-users"
          :title="t('admin.noAttendees', 'No tickets yet.')"
        />
      </template>
    </UTable>
  </SectionCard>
</template>
