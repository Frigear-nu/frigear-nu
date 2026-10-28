<script setup lang="ts">
import { renderSVG } from 'uqr'
import type { TicketDto } from '../../../types'

const props = defineProps<{ ticket: TicketDto, to?: string }>()
const emit = defineEmits<{ pay: [ticketId: string] }>()
const t = useModuleT('events')
const format = useFormat()
const tr = useEventsTranslate()

// The ticket type and the chosen add-ons, under the event name.
const description = computed(() => [props.ticket.ticketTypeName, ...props.ticket.addons.map(addon => addon.label)].map(value => tr(value)).filter(Boolean).join(' · '))

// An <img> data URI (not v-html): the SVG is generated locally from the code and never parsed as markup.
const qr = computed(() => (props.ticket.code ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(props.ticket.code, { border: 1 }))}` : null))
const showQr = ref(false)
const canPay = computed(() => props.ticket.status === 'pending')
const hasActions = computed(() => !!props.to || !!qr.value || canPay.value)
</script>

<template>
  <SectionCard
    :title="tr(ticket.eventName)"
    :description="description"
  >
    <template #actions>
      <StatusBadge
        :status="ticket.status"
        :label="t(`tickets.status.${ticket.status}`, ticket.status)"
        :colors="{ refunded: 'error' }"
      />
    </template>

    <div class="flex flex-col gap-3">
      <p class="flex flex-wrap items-center gap-2 text-sm">
        <span class="tabular-nums">{{ ticket.amount === 0 ? t('detail.tickets.free', 'Free') : format.money(ticket.amount, ticket.currency) }}</span>
        <UBadge
          v-if="ticket.checkedInAt"
          color="info"
          variant="subtle"
          icon="i-lucide-check"
          :label="t('checkedIn', 'Checked in')"
        />
      </p>
      <img
        v-if="showQr && qr"
        :src="qr"
        :alt="t('tickets.qrAlt', 'Ticket QR code')"
        class="mx-auto w-56 rounded-md bg-white p-2"
      >
    </div>

    <template
      v-if="hasActions"
      #footer
    >
      <div class="flex flex-wrap justify-end gap-2">
        <UButton
          v-if="to"
          :to="to"
          color="neutral"
          variant="outline"
          :label="t('viewEvent', 'View event')"
        />
        <UButton
          v-if="qr"
          color="neutral"
          variant="outline"
          icon="i-lucide-qr-code"
          :label="showQr ? t('hideQr', 'Hide QR code') : t('tickets.viewQrCode', 'Show QR code')"
          @click="showQr = !showQr"
        />
        <UButton
          v-if="canPay"
          :label="t('tickets.payNow', 'Pay now')"
          @click="emit('pay', ticket.id)"
        />
      </div>
    </template>
  </SectionCard>
</template>
