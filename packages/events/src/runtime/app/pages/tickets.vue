<script setup lang="ts">
const t = useModuleT('events')
const { tickets, pay } = useMyTickets()
const pages = useRuntimeConfig().public.events?.pages
const eventTo = (slug: string) => (pages?.event || '/events/:slug').replace(':slug', encodeURIComponent(slug))
defineOptions({ name: 'EventTicketsPage' })
</script>

<template>
  <UContainer class="py-10">
    <h1 class="mb-6 text-2xl font-semibold">
      {{ t('myTickets', 'My tickets') }}
    </h1>
    <p
      v-if="!tickets.length"
      class="text-muted"
    >
      {{ t('noTickets', 'You do not have any tickets yet.') }}
    </p>
    <div class="grid gap-4 md:grid-cols-2">
      <EventTicketCard
        v-for="ticket in tickets"
        :key="ticket.id"
        :ticket="ticket"
        :to="eventTo(ticket.eventSlug)"
        @pay="pay"
      />
    </div>
  </UContainer>
</template>
