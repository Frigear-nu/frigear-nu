<script setup lang="ts">
defineOptions({ name: 'EventTicketsPage' })

// No container or heading of its own: the `account` layout of `@frigear-nu/account` (applied to `/account/**`)
// provides the left navigation and the page heading.
const t = useModuleT('events')
// Awaited, so the server renders the tickets; on client navigation the remembered list shows at once.
const { tickets, loading, error, refresh, pay } = await useMyTickets()
const links = useEventLinks()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="loading"
      class="grid gap-4 md:grid-cols-2"
      aria-busy="true"
    >
      <SectionCard
        v-for="index in 2"
        :key="index"
        loading
      />
    </div>
    <UEmpty
      v-else-if="error && !tickets.length"
      icon="i-lucide-circle-alert"
      :title="t('ticketsLoadFailed', 'Your tickets could not be loaded')"
      :description="errorMessage(error)"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else-if="!tickets.length"
      icon="i-lucide-ticket"
      :title="t('noTicketsTitle', 'No tickets yet')"
      :description="t('noTickets', 'You do not have any tickets yet.')"
      :actions="[{ label: t('browseEvents', 'Browse events'), to: links.events(), icon: 'i-lucide-calendar' }]"
    />
    <div
      v-else
      class="grid gap-4 md:grid-cols-2"
    >
      <EventTicketCard
        v-for="ticket in tickets"
        :key="ticket.id"
        :ticket="ticket"
        :to="links.event(ticket.eventSlug)"
        @pay="pay"
      />
    </div>
  </div>
</template>
