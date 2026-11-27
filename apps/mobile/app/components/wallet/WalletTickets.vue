<script setup lang="ts">
import { eventsApi } from '@frigear-nu/events/api'
import type { TicketDto } from '@frigear-nu/events'
import { translate } from '@frigear-nu/ui/translated'

// The user's event tickets (`GET /api/events/me/tickets` on the website). Upcoming tickets that can still be used (paid,
// or waiting for payment) first, soonest first; past, cancelled, refunded and expired ones folded away below. A ticket
// opens its page with the QR code for the door.
const { t, locale } = useI18n()
const format = useFormat()
const localePath = useLocalePath()
const host = useMobileHost()
const hostPath = useHostPath()

const { data, status, error, refresh } = await useFetch<TicketDto[]>(eventsApi.me.tickets, { key: 'wallet-tickets', default: () => [] })

// An event counts as upcoming for the whole day it starts on: a ticket stays at the top while the event runs.
const startOfToday = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime()
}
const usable = (ticket: TicketDto) => ticket.status === 'paid' || ticket.status === 'pending'

const groups = computed(() => {
  const since = startOfToday()
  const tickets = data.value ?? []
  const upcoming = tickets.filter(ticket => usable(ticket) && new Date(ticket.startsAt).getTime() >= since)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const other = tickets.filter(ticket => !upcoming.includes(ticket))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  return { upcoming, other }
})

const row = (ticket: TicketDto) => ({
  id: ticket.id,
  event: translate(ticket.eventName, locale.value),
  type: translate(ticket.ticketTypeName, locale.value),
  when: format.dateTime(ticket.startsAt),
  status: ticket.status,
  checkedIn: !!ticket.checkedInAt,
  to: localePath(`/wallet/tickets/${encodeURIComponent(ticket.id)}`),
})
const upcoming = computed(() => groups.value.upcoming.map(row))
const other = computed(() => groups.value.other.map(row))
const showOther = ref(false)

const loading = computed(() => status.value === 'pending' && !data.value?.length)
const findEvents = () => host.open(hostPath('/events'))
</script>

<template>
  <div class="flex flex-col gap-3">
    <UAlert
      v-if="error && !data?.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('app.wallet.tickets.error')"
      :actions="[{ label: t('app.wallet.tickets.retry'), color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <ListCard
      v-else
      :title="t('app.wallet.tickets.title')"
      :loading="loading"
      :is-empty="!upcoming.length"
      :empty="other.length ? t('app.wallet.tickets.noneUpcoming') : t('app.wallet.tickets.empty')"
      data-wallet-tickets
    >
      <template #actions>
        <UButton
          :label="t('app.wallet.tickets.findEvents')"
          icon="i-lucide-calendar-search"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="findEvents"
        />
      </template>
      <li
        v-for="ticket in upcoming"
        :key="ticket.id"
      >
        <WalletTicketRow v-bind="ticket" />
      </li>
    </ListCard>

    <UCollapsible
      v-if="other.length"
      v-model:open="showOther"
    >
      <UButton
        :label="t('app.wallet.tickets.other', { count: other.length })"
        color="neutral"
        variant="ghost"
        block
        :trailing-icon="showOther ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
      />
      <template #content>
        <ListCard
          :title="t('app.wallet.tickets.otherTitle')"
          class="mt-2"
        >
          <li
            v-for="ticket in other"
            :key="ticket.id"
          >
            <WalletTicketRow v-bind="ticket" />
          </li>
        </ListCard>
      </template>
    </UCollapsible>
  </div>
</template>
