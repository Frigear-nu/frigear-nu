<script setup lang="ts">
defineOptions({ name: 'EventTicketsPage' })

// No container or heading of its own: the `account` layout of `@frigear-nu/account` (applied to `/account/**`)
// provides the left navigation and the page heading.
const t = useModuleT('events')
const { tickets, pay } = useMyTickets()
const links = useEventLinks()
</script>

<template>
  <div class="flex flex-col gap-4">
    <UEmpty
      v-if="!tickets.length"
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
