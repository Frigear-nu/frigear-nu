<script setup lang="ts">
// MDC comes from the host app (Nuxt Content); resolves to a plain string name when absent.
const hasMdc = typeof resolveComponent('MDC') !== 'string'
const t = useModuleT('events')
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { loggedIn } = useUserSession()
const { event, error, purchase, refresh } = await useEvent(slug)
const locale = useEventsLocale()
const tr = useEventsTranslate()
const toast = useToast()

if (!event.value) {
  throw createError({ statusCode: error.value?.statusCode ?? 404, statusMessage: t('notFound', 'Event not found'), fatal: true })
}
const eventsPath = useRuntimeConfig().public.events?.pages?.events || '/events'

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
useSeoMeta({ title: () => (event.value ? tr(event.value.name) : 'Event') })
defineOptions({ name: 'EventDetailPage' })
</script>

<template>
  <UContainer class="py-8 sm:py-12">
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

      <UButton
        :to="eventsPath"
        color="neutral"
        variant="link"
        size="sm"
        class="mb-4 -ml-2.5"
        leading-icon="i-lucide-arrow-left"
        :label="t('backToEvents', 'All events')"
      />

      <!-- Hero -->
      <div class="relative overflow-hidden rounded-xl ring ring-default">
        <img
          v-if="event.image"
          :src="event.image"
          :alt="tr(event.name)"
          class="aspect-[2/1] w-full object-cover sm:aspect-[3/1]"
        >
        <div
          v-else
          class="gradient-linear-br-teal-purple aspect-[3/1] w-full sm:aspect-[4/1]"
        />
      </div>

      <header class="mt-8 space-y-4">
        <div
          v-if="event.requiresMembership"
          class="flex flex-wrap items-center gap-2"
        >
          <UBadge
            color="warning"
            variant="subtle"
            icon="i-lucide-user-star"
            :label="t('members', 'Members')"
          />
        </div>
        <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-5xl">
          {{ tr(event.name) }}
        </h1>
        <p
          v-if="event.description"
          class="max-w-3xl text-lg text-muted"
        >
          {{ tr(event.description) }}
        </p>

        <div class="grid gap-3 pt-2 sm:grid-cols-2">
          <div class="flex items-start gap-3 rounded-xl bg-elevated/50 p-4 ring ring-default">
            <UIcon
              name="i-lucide-calendar"
              class="mt-0.5 size-5 shrink-0 text-primary"
            />
            <div class="min-w-0">
              <div class="text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t('detail.when', 'When?') }}
              </div>
              <div class="font-medium text-highlighted">
                <NuxtTime
                  :datetime="event.startsAt"
                  :locale="locale"
                  date-style="full"
                  time-style="short"
                />
                <template v-if="event.endsAt">
                  –
                  <NuxtTime
                    :datetime="event.endsAt"
                    :locale="locale"
                    time-style="short"
                  />
                </template>
              </div>
            </div>
          </div>
          <component
            :is="event.locationUrl ? 'a' : 'div'"
            v-if="event.location"
            :href="event.locationUrl || undefined"
            :target="event.locationUrl ? '_blank' : undefined"
            :rel="event.locationUrl ? 'noopener' : undefined"
            class="flex items-start gap-3 rounded-xl bg-elevated/50 p-4 ring ring-default"
            :class="event.locationUrl ? 'transition hover:bg-elevated' : ''"
          >
            <UIcon
              name="i-lucide-map-pin"
              class="mt-0.5 size-5 shrink-0 text-primary"
            />
            <div class="min-w-0">
              <div class="text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t('detail.where', 'Where?') }}
              </div>
              <div class="flex items-center gap-1.5 font-medium text-highlighted">
                {{ tr(event.location) }}
                <UIcon
                  v-if="event.locationUrl"
                  name="i-lucide-external-link"
                  class="size-4 text-muted"
                />
              </div>
            </div>
          </component>
        </div>

        <div
          v-if="event.ticketTypes.length"
          class="md:hidden"
        >
          <UButton
            href="#tickets"
            size="lg"
            block
            trailing-icon="i-lucide-ticket"
            :label="t('detail.tickets.view', 'Show tickets')"
          />
        </div>
      </header>

      <div class="mt-10 grid gap-10 lg:grid-cols-[2fr_1fr] lg:items-start">
        <!-- Body renders as MDC when the host has it (Nuxt Content), else plain text; override via the `body` slot. -->
        <div>
          <slot
            name="body"
            :event="event"
            :body="tr(event.body ?? event.description)"
          >
            <MDC
              v-if="hasMdc"
              :value="tr(event.body ?? event.description)"
              class="prose max-w-none text-muted"
            />
            <div
              v-else
              class="whitespace-pre-line text-muted"
            >
              {{ tr(event.body ?? event.description) }}
            </div>
          </slot>
        </div>
        <UCard
          id="tickets"
          :ui="{ root: 'rounded-xl shadow-sm scroll-mt-24 lg:sticky lg:top-24' }"
        >
          <template #header>
            <h2 class="text-lg font-semibold">
              {{ t('detail.tickets.title', 'Tickets') }}
            </h2>
          </template>
          <EventTicketPicker
            :ticket-types="event.ticketTypes"
            :logged-in="loggedIn"
            :loading="buying"
            @purchase="onPurchase"
          />
        </UCard>
      </div>
    </template>
  </UContainer>
</template>
