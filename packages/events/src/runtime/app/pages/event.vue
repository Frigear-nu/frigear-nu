<script setup lang="ts">
import { translate } from '../../utils'

const t = useModuleT('events')
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { loggedIn } = useUserSession()
const { event, status, error, purchase, refresh } = useEvent(slug)
const locale = useEventsLocale()
const toast = useToast()

if (error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: t('notFound', 'Event not found'), fatal: true })
}

const buying = ref(false)
async function onPurchase(ticketTypeId: string, addonIds: string[]) {
  buying.value = true
  try {
    const result = await purchase(ticketTypeId, addonIds)
    if (!result.url) toast.add({ title: t('ticketReady', 'Your ticket is ready'), color: 'success' })
  }
  catch (e) {
    toast.add({ title: (e as { statusMessage?: string }).statusMessage ?? t('purchaseFailed', 'Could not buy the ticket'), color: 'error' })
  }
  finally {
    buying.value = false
  }
}

// Back from Stripe: the ticket only turns paid when Stripe's event reaches us, so poll for it.
const payment = computed(() => route.query.payment as string | undefined)
const returnedTicket = computed(() => route.query.ticket as string | undefined)
const paidState = ref<'waiting' | 'paid' | 'timeout' | null>(null)
onMounted(async () => {
  if (payment.value !== 'success' || !returnedTicket.value) return
  paidState.value = 'waiting'
  for (let attempt = 0; attempt < 20; attempt++) {
    const ticket = await $fetch<{ status: string }>(`/api/events/tickets/${returnedTicket.value}`).catch(() => null)
    if (ticket?.status === 'paid') {
      paidState.value = 'paid'
      await refresh()
      return
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  paidState.value = 'timeout'
})

const ticketsPath = useRuntimeConfig().public.events?.pages?.tickets
useSeoMeta({ title: () => (event.value ? translate(event.value.name, locale.value) : 'Event') })
defineOptions({ name: 'EventDetailPage' })
</script>

<template>
  <UContainer class="py-10">
    <template v-if="event">
      <UAlert
        v-if="paidState === 'waiting'"
        class="mb-6"
        color="info"
        variant="subtle"
        :title="t('detail.tickets.payment.verifying.description', 'Confirming your payment…')"
      />
      <UAlert
        v-else-if="paidState === 'paid'"
        class="mb-6"
        color="success"
        variant="subtle"
        :title="t('paymentReceived', 'Payment received - your ticket is ready.')"
      >
        <template
          v-if="ticketsPath"
          #actions
        >
          <UButton
            :to="ticketsPath"
            size="xs"
          >
            {{ t('detail.tickets.view', 'View ticket') }}
          </UButton>
        </template>
      </UAlert>
      <UAlert
        v-else-if="paidState === 'timeout'"
        class="mb-6"
        color="warning"
        variant="subtle"
        :title="t('paymentTimeout', 'We have not received the payment confirmation yet. It will show up under your tickets shortly.')"
      />
      <UAlert
        v-else-if="payment === 'cancel'"
        class="mb-6"
        color="neutral"
        variant="subtle"
        :title="t('paymentCancelled', 'Payment cancelled. Your reservation is held for a short while; you can pay from your tickets.')"
      />

      <img
        v-if="event.image"
        :src="event.image"
        :alt="translate(event.name, locale)"
        class="mb-6 aspect-[3/1] w-full rounded-lg object-cover"
      >
      <UPageHeader
        :title="translate(event.name, locale)"
        :description="translate(event.description, locale)"
        :ui="{ title: 'text-3xl sm:text-4xl' }"
      >
        <div class="mt-2 flex flex-col gap-2">
          <UFieldGroup>
            <UBadge
              variant="soft"
              class="text-sm font-semibold"
              :label="t('detail.when', 'When?')"
            />
            <UBadge
              variant="soft"
              size="sm"
              class="text-sm"
            >
              <NuxtTime
                :datetime="event.startsAt"
                :locale="locale"
                date-style="full"
                time-style="short"
              />
              <template v-if="event.endsAt">
                -
                <NuxtTime
                  :datetime="event.endsAt"
                  :locale="locale"
                  date-style="full"
                  time-style="short"
                />
              </template>
            </UBadge>
          </UFieldGroup>
          <component
            :is="event.locationUrl ? 'a' : 'div'"
            v-if="event.location"
            :href="event.locationUrl || undefined"
            :target="event.locationUrl ? '_blank' : undefined"
            :rel="event.locationUrl ? 'noopener' : undefined"
          >
            <UFieldGroup>
              <UBadge
                variant="soft"
                class="text-sm font-semibold"
                :label="t('detail.where', 'Where?')"
              />
              <UBadge
                variant="soft"
                size="sm"
                class="text-sm"
                :trailing-icon="event.locationUrl ? 'i-lucide-external-link' : undefined"
                :label="event.location"
              />
            </UFieldGroup>
          </component>
          <div
            v-if="event.ticketTypes.length"
            class="mt-2 md:hidden"
          >
            <UButton
              href="#tickets"
              size="lg"
              color="neutral"
              trailing-icon="i-lucide-ticket"
              :label="t('detail.tickets.view', 'Show tickets')"
            />
          </div>
        </div>
      </UPageHeader>

      <div class="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <!-- Plain text body: markdown rendering is left to the host via the `body` slot. -->
        <div>
          <slot
            name="body"
            :event="event"
            :body="translate(event.body ?? event.description, locale)"
          >
            <div class="whitespace-pre-line text-muted">
              {{ translate(event.body ?? event.description, locale) }}
            </div>
          </slot>
        </div>
        <UPageCard
          id="tickets"
          variant="soft"
          class="self-start scroll-mt-20"
        >
          <EventTicketPicker
            :ticket-types="event.ticketTypes"
            :logged-in="loggedIn"
            :loading="buying"
            @purchase="onPurchase"
          />
        </UPageCard>
      </div>
    </template>
    <p
      v-else-if="status === 'pending'"
      class="text-muted"
    >
      {{ t('loading', 'Loading…') }}
    </p>
  </UContainer>
</template>
