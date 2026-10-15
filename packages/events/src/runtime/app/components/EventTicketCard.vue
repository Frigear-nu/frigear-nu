<script setup lang="ts">
import { renderSVG } from 'uqr'
import type { TicketDto } from '../../../types'

const props = defineProps<{ ticket: TicketDto, to?: string }>()
const emit = defineEmits<{ pay: [ticketId: string] }>()
const t = useModuleT('events')
const format = useFormat()
const tr = useEventsTranslate()

// An <img> data URI (not v-html): the SVG is generated locally from the code and never parsed as markup.
const qr = computed(() => (props.ticket.code ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(props.ticket.code, { border: 1 }))}` : null))
const showQr = ref(false)
</script>

<template>
  <UCard :ui="{ body: 'flex flex-col gap-3' }">
    <div class="flex items-start gap-2">
      <div>
        <h3 class="text-highlighted font-semibold">
          {{ tr(ticket.eventName) }}
        </h3>
        <p class="text-sm text-muted">
          {{ tr(ticket.ticketTypeName) }}<template
            v-for="addon in ticket.addons"
            :key="addon.id"
          >
            · {{ tr(addon.label) }}
          </template>
        </p>
      </div>
      <UBadge
        class="ml-auto capitalize"
        :color="statusColor(ticket.status, { refunded: 'error' })"
        variant="subtle"
      >
        {{ t(`tickets.status.${ticket.status}`, ticket.status) }}
      </UBadge>
    </div>
    <p class="text-sm">
      {{ ticket.amount === 0 ? t('detail.tickets.free', 'Free') : format.money(ticket.amount, ticket.currency) }}
      <UBadge
        v-if="ticket.checkedInAt"
        color="info"
        variant="subtle"
        class="ml-2"
      >
        {{ t('checkedIn', 'Checked in') }}
      </UBadge>
    </p>
    <div class="flex gap-2">
      <UButton
        v-if="ticket.status === 'pending'"
        @click="emit('pay', ticket.id)"
      >
        {{ t('tickets.payNow', 'Pay now') }}
      </UButton>
      <UButton
        v-if="qr"
        variant="subtle"
        icon="i-lucide-qr-code"
        @click="showQr = !showQr"
      >
        {{ showQr ? t('hideQr', 'Hide QR code') : t('tickets.viewQrCode', 'Show QR code') }}
      </UButton>
      <UButton
        v-if="to"
        :to="to"
        variant="ghost"
        class="ml-auto"
      >
        {{ t('viewEvent', 'View event') }}
      </UButton>
    </div>
    <img
      v-if="showQr && qr"
      :src="qr"
      :alt="t('tickets.qrAlt', 'Ticket QR code')"
      class="mx-auto w-56 rounded-md bg-white p-2"
    >
  </UCard>
</template>
