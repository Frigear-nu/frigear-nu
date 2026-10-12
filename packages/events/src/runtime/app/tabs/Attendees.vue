<script setup lang="ts">
import type { AdminEvent } from '../utils/admin-event'
import { useAdminAction } from '../utils/admin-event'

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

const props = defineProps<{ event: AdminEvent }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const confirmAction = useConfirmDialog()
const { run } = useAdminAction()

const { data: attendees, refresh } = await useFetch<Attendee[]>(() => `/api/events/admin/events/${props.event.id}/tickets`, { default: () => [] })

const typeName = (ticketTypeId: string) => tr(props.event.ticketTypes.find(item => item.id === ticketTypeId)?.name)
const statusColor: Record<string, 'success' | 'warning' | 'neutral' | 'error'> = { paid: 'success', pending: 'warning', cancelled: 'neutral', refunded: 'neutral', expired: 'neutral' }

const ticketAction = async (ticket: Attendee, action: 'cancel' | 'refund') => {
  const confirmed = await confirmAction({
    title: action === 'refund' ? t('admin.confirmRefund', 'Refund this ticket?') : t('admin.confirmCancel', 'Cancel this ticket?'),
    confirmText: action === 'refund' ? t('admin.refund', 'Refund') : t('admin.cancel', 'Cancel'),
    destructive: true,
  })
  if (!confirmed) return
  return run(async () => {
    await $fetch(`/api/events/admin/tickets/${ticket.id}/${action}`, { method: 'POST' })
    await refresh()
  }, action === 'refund' ? t('admin.refunded', 'Refunded.') : t('admin.cancelled', 'Cancelled.'))
}

const columns = [
  { accessorKey: 'userName', header: t('admin.attendee', 'Attendee') },
  { accessorKey: 'ticketTypeId', header: t('admin.ticketType', 'Ticket') },
  { accessorKey: 'status', header: t('admin.status', 'Status') },
  { accessorKey: 'checkedInAt', header: t('admin.checkedIn', 'Checked in') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <AdminSection :title="t('admin.attendees', 'Attendees')">
    <template #flush>
      <UTable
        v-if="attendees.length"
        :data="attendees"
        :columns="columns"
      >
        <template #userName-cell="{ row }">
          <span class="font-medium">{{ row.original.userName }}</span>
          <span class="text-muted"> · {{ row.original.userEmail }}</span>
        </template>
        <template #ticketTypeId-cell="{ row }">
          {{ typeName(row.original.ticketTypeId) }}
        </template>
        <template #status-cell="{ row }">
          <UBadge
            variant="subtle"
            :color="statusColor[row.original.status] ?? 'neutral'"
            :label="row.original.status"
          />
        </template>
        <template #checkedInAt-cell="{ row }">
          {{ row.original.checkedInAt ? '✓' : '–' }}
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              v-if="row.original.status === 'paid' && row.original.paymentId"
              size="xs"
              variant="outline"
              color="neutral"
              :label="t('admin.refund', 'Refund')"
              @click="ticketAction(row.original, 'refund')"
            />
            <UButton
              v-if="row.original.status === 'paid' || row.original.status === 'pending'"
              size="xs"
              variant="ghost"
              color="error"
              :label="t('admin.cancel', 'Cancel')"
              @click="ticketAction(row.original, 'cancel')"
            />
          </div>
        </template>
      </UTable>
    </template>
    <AdminEmpty
      v-if="!attendees.length"
      icon="i-lucide-users"
      :title="t('admin.noAttendees', 'No tickets yet.')"
    />
  </AdminSection>
</template>
