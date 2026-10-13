<script setup lang="ts">
const t = useModuleT('events')
const { tickets, pay } = useMyTickets()
const pages = useRuntimeConfig().public.events?.pages
const eventTo = (slug: string) => (pages?.event || '/events/:slug').replace(':slug', encodeURIComponent(slug))
// The account header (title, "Back to account", signed-in user) comes from `@frigear-nu/account`, which is optional here.
const AccountHeader = resolveComponent('AccountHeader')
const hasAccountHeader = typeof AccountHeader !== 'string'
defineOptions({ name: 'EventTicketsPage' })
</script>

<template>
  <div>
    <AccountHeader v-if="hasAccountHeader" />
    <UContainer :class="hasAccountHeader ? 'pb-10' : 'py-10'">
      <UPageHeader
        v-if="!hasAccountHeader"
        :title="t('myTickets', 'My tickets')"
        :ui="{ root: 'pt-0 pb-6 mb-6', title: 'text-2xl sm:text-3xl' }"
      />
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
  </div>
</template>
