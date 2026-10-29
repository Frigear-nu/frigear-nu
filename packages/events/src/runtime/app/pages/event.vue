<script setup lang="ts">
// MDC comes from the host app (Nuxt Content); resolves to a plain string name when absent.
const hasMdc = typeof resolveComponent('MDC') !== 'string'
const t = useModuleT('events')
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { loggedIn } = useUserSession()
const { event, error, purchase, refresh } = await useEvent(slug)
const tr = useEventsTranslate()
const format = useFormat()
const links = useEventLinks()
const toast = useToast()
const { busy: buying, run } = useAction()

if (!event.value) {
  throw createError({ statusCode: error.value?.statusCode ?? 404, statusMessage: t('notFound', 'Event not found'), fatal: true })
}

const onPurchase = (ticketTypeId: string, addonIds: string[]) => run(async () => {
  const result = await purchase(ticketTypeId, addonIds)
  if (!result.url) toast.add({ title: t('ticketReady', 'Your ticket is ready'), color: 'success', icon: 'i-lucide-check' })
}, { error: t('purchaseFailed', 'Could not buy the ticket') })

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

const hasTicketsPage = !!useRuntimeConfig().public.events?.pages?.tickets
useSeoMeta({ title: () => (event.value ? tr(event.value.name) : 'Event') })
defineOptions({ name: 'EventDetailPage' })
</script>

<template>
  <UContainer>
    <UPage v-if="event">
      <UPageHeader
        :title="tr(event.name)"
        :description="event.description ? tr(event.description) : undefined"
      >
        <template #headline>
          <UBreadcrumb :items="[{ label: t('title', 'Events'), to: links.events() }, { label: tr(event.name) }]" />
        </template>
        <div
          v-if="event.requiresMembership"
          class="mt-3"
        >
          <UBadge
            color="warning"
            variant="subtle"
            icon="i-lucide-user-star"
            :label="t('members', 'Members')"
          />
        </div>
      </UPageHeader>

      <UPageBody>
        <UAlert
          v-if="paidState === 'waiting'"
          color="info"
          variant="subtle"
          :title="t('detail.tickets.payment.verifying.description', 'Confirming your payment…')"
        />
        <UAlert
          v-else-if="paidState === 'paid'"
          color="success"
          variant="subtle"
          :title="t('paymentReceived', 'Payment received - your ticket is ready.')"
        >
          <template
            v-if="hasTicketsPage"
            #actions
          >
            <UButton
              :to="links.tickets()"
              size="xs"
            >
              {{ t('detail.tickets.view', 'View ticket') }}
            </UButton>
          </template>
        </UAlert>
        <UAlert
          v-else-if="paidState === 'timeout'"
          color="warning"
          variant="subtle"
          :title="t('paymentTimeout', 'We have not received the payment confirmation yet. It will show up under your tickets shortly.')"
        />
        <UAlert
          v-else-if="payment === 'cancel'"
          color="neutral"
          variant="subtle"
          :title="t('paymentCancelled', 'Payment cancelled. Your reservation is held for a short while; you can pay from your tickets.')"
        />

        <!-- Hero -->
        <div class="ring-default relative overflow-hidden rounded-lg ring">
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

        <div class="grid gap-3 sm:grid-cols-2">
          <div
            class="flex items-start gap-3 p-4"
            :class="surfaceClass"
          >
            <UIcon
              name="i-lucide-calendar"
              class="text-primary mt-0.5 size-5 shrink-0"
            />
            <div class="min-w-0">
              <div class="text-muted text-xs font-semibold uppercase tracking-wide">
                {{ t('detail.when', 'When?') }}
              </div>
              <div class="text-highlighted font-medium">
                {{ format.dateRange(event.startsAt, event.endsAt, { dateStyle: 'full', timeStyle: 'short' }) }}
              </div>
            </div>
          </div>
          <component
            :is="event.locationUrl ? 'a' : 'div'"
            v-if="event.location"
            :href="event.locationUrl || undefined"
            :target="event.locationUrl ? '_blank' : undefined"
            :rel="event.locationUrl ? 'noopener' : undefined"
            class="flex items-start gap-3 p-4"
            :class="[surfaceClass, event.locationUrl ? 'hover:bg-elevated transition' : '']"
          >
            <UIcon
              name="i-lucide-map-pin"
              class="text-primary mt-0.5 size-5 shrink-0"
            />
            <div class="min-w-0">
              <div class="text-muted text-xs font-semibold uppercase tracking-wide">
                {{ t('detail.where', 'Where?') }}
              </div>
              <div class="text-highlighted flex items-center gap-1.5 font-medium">
                {{ tr(event.location) }}
                <UIcon
                  v-if="event.locationUrl"
                  name="i-lucide-external-link"
                  class="text-muted size-4"
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

        <div class="grid gap-10 lg:grid-cols-[2fr_1fr] lg:items-start">
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
                class="prose text-muted max-w-none"
              />
              <div
                v-else
                class="text-muted whitespace-pre-line"
              >
                {{ tr(event.body ?? event.description) }}
              </div>
            </slot>
          </div>
          <SectionCard
            id="tickets"
            :title="t('detail.tickets.title', 'Tickets')"
            class="scroll-mt-24 lg:sticky lg:top-24"
          >
            <EventTicketPicker
              :ticket-types="event.ticketTypes"
              :logged-in="loggedIn"
              :loading="buying"
              @purchase="onPurchase"
            />
          </SectionCard>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
