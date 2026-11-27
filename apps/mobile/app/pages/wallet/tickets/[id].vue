<script setup lang="ts">
import { renderSVG } from 'uqr'
import { eventsApi } from '@frigear-nu/events/api'
import type { TicketDto } from '@frigear-nu/events'
import { translate } from '@frigear-nu/ui/translated'

// One ticket, to show at the door: a big QR code on white (also in dark mode, so any scanner reads it), with the event,
// ticket type, holder and date. Only a paid ticket has a code (`GET /api/events/me/tickets/:id` on the website); a ticket
// waiting for payment is paid on the event's page on the website.
definePageMeta({
  mobile: { title: 'Ticket', titleKey: 'app.wallet.ticket.title', largeTitle: false, tabBar: false },
})

const { t, locale } = useI18n()
const route = useRoute()
const format = useFormat()
const host = useMobileHost()
const hostPath = useHostPath()
const { user } = useUserSession()

const id = computed(() => String(route.params.id ?? ''))
const { data: ticket, status, error, refresh } = await useFetch<TicketDto>(() => eventsApi.me.ticket(id.value), { key: `wallet-ticket-${id.value}` })

const holder = computed(() => (user.value as { name?: string } | null)?.name ?? '')
const view = computed(() => {
  const value = ticket.value
  if (!value) return null
  return {
    event: translate(value.eventName, locale.value),
    details: [value.ticketTypeName, ...value.addons.map(addon => addon.label)].map(text => translate(text, locale.value)).filter(Boolean).join(' · '),
    when: format.dateTime(value.startsAt),
    // An <img> data URI (not v-html): the SVG is generated here from the code and never parsed as markup.
    qr: value.code ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(value.code, { border: 1 }))}` : null,
  }
})

const payOnWebsite = () => ticket.value && host.open(hostPath(`/events/${encodeURIComponent(ticket.value.eventSlug)}`))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="status === 'pending' && !ticket"
      class="flex flex-col items-center gap-4"
    >
      <USkeleton class="aspect-square w-full max-w-sm rounded-xl" />
      <USkeleton class="h-6 w-2/3" />
      <USkeleton class="h-4 w-1/2" />
    </div>
    <UAlert
      v-else-if="error || !ticket || !view"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error?.statusCode === 404 ? t('app.wallet.ticket.notFound') : t('app.wallet.ticket.error')"
      :actions="[{ label: t('app.wallet.tickets.retry'), color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <template v-else>
      <!-- Light on purpose in both colour modes: a door scanner reads dark modules on white best. -->
      <section
        class="flex flex-col items-center gap-4 rounded-2xl bg-white p-5 text-center text-neutral-900 shadow-sm ring-1 ring-neutral-200"
        data-wallet-ticket
      >
        <div class="flex flex-col gap-1">
          <h1 class="text-xl font-bold">
            {{ view.event }}
          </h1>
          <p class="text-neutral-600">
            {{ view.details }}
          </p>
        </div>
        <img
          v-if="view.qr"
          :src="view.qr"
          :alt="t('app.wallet.ticket.qrAlt')"
          class="aspect-square w-full max-w-sm"
        >
        <dl class="grid w-full grid-cols-2 gap-3 text-left text-sm">
          <div v-if="holder">
            <dt class="text-neutral-500">
              {{ t('app.wallet.ticket.holder') }}
            </dt>
            <dd class="font-medium">
              {{ holder }}
            </dd>
          </div>
          <div>
            <dt class="text-neutral-500">
              {{ t('app.wallet.ticket.when') }}
            </dt>
            <dd class="font-medium">
              {{ view.when }}
            </dd>
          </div>
        </dl>
        <UBadge
          v-if="ticket.checkedInAt"
          color="info"
          variant="subtle"
          icon="i-lucide-check"
          :label="t('app.wallet.ticket.checkedInAt', { time: format.dateTime(ticket.checkedInAt) })"
        />
      </section>

      <UAlert
        v-if="ticket.status === 'pending'"
        color="warning"
        variant="subtle"
        icon="i-lucide-hourglass"
        :title="t('app.wallet.ticket.pending.title')"
        :description="t('app.wallet.ticket.pending.description')"
        :actions="[{ label: t('app.wallet.ticket.pending.pay'), icon: 'i-lucide-external-link', onClick: payOnWebsite }]"
      />
      <UAlert
        v-else-if="ticket.status !== 'paid'"
        color="error"
        variant="subtle"
        icon="i-lucide-ban"
        :title="t('app.wallet.ticket.notValid', { status: t(`app.wallet.status.${ticket.status}`) })"
      />
    </template>
  </div>
</template>
