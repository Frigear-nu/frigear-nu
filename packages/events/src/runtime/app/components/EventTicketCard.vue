<script setup lang="ts">
import { renderSVG } from 'uqr'
import type { TicketDto } from '../../../types'
import { formatPrice, translate } from '../../utils'

const props = defineProps<{ ticket: TicketDto, to?: string }>()
const emit = defineEmits<{ pay: [ticketId: string] }>()
const t = useModuleT('events')
const locale = useEventsLocale()

const colors: Record<string, 'success' | 'warning' | 'neutral' | 'error'> = { paid: 'success', pending: 'warning', cancelled: 'neutral', expired: 'neutral', refunded: 'error' }
// An <img> data URI (not v-html): the SVG is generated locally from the code and never parsed as markup.
const qr = computed(() => (props.ticket.code ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(props.ticket.code, { border: 1 }))}` : null))
const showQr = ref(false)
</script>

<template>
  <UCard :ui="{ body: 'flex flex-col gap-3' }">
    <div class="flex items-start gap-2">
      <div>
        <h3 class="font-semibold">
          {{ translate(ticket.eventName, locale) }}
        </h3>
        <p class="text-sm text-muted">
          {{ translate(ticket.ticketTypeName, locale) }}<template
            v-for="addon in ticket.addons"
            :key="addon.id"
          >
            · {{ translate(addon.label, locale) }}
          </template>
        </p>
      </div>
      <UBadge
        class="ml-auto capitalize"
        :color="colors[ticket.status] ?? 'neutral'"
        variant="subtle"
      >
        {{ t(`tickets.status.${ticket.status}`, ticket.status) }}
      </UBadge>
    </div>
    <p class="text-sm">
      {{ ticket.amount === 0 ? t('detail.tickets.free', 'Free') : formatPrice(ticket.amount, ticket.currency, locale) }}
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
      alt="Ticket QR code"
      class="mx-auto w-56 rounded-md bg-white p-2"
    >
  </UCard>
</template>
