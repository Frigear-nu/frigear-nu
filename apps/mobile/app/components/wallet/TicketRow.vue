<script setup lang="ts">
import type { TicketDto } from '@frigear-nu/events'

// One ticket in the Wallet's lists: event, ticket type and date, its status unless it is simply paid. Opens the ticket.
defineProps<{
  event: string
  type: string
  when: string
  status: TicketDto['status']
  checkedIn: boolean
  to: string
}>()

const { t } = useI18n()
</script>

<template>
  <NuxtLink
    :to="to"
    class="-mx-4 flex items-center gap-3 px-4 active:bg-elevated"
  >
    <div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated">
      <UIcon
        name="i-lucide-ticket"
        class="size-5 text-muted"
      />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate font-medium text-highlighted">
        {{ event }}
      </p>
      <p class="truncate text-muted">
        {{ type }} · {{ when }}
      </p>
    </div>
    <UBadge
      v-if="checkedIn"
      color="info"
      variant="subtle"
      icon="i-lucide-check"
      :label="t('app.wallet.ticket.checkedIn')"
    />
    <StatusBadge
      v-else-if="status !== 'paid'"
      :status="status"
      :label="t(`app.wallet.status.${status}`)"
      :colors="{ refunded: 'error' }"
    />
    <UIcon
      name="i-lucide-chevron-right"
      class="size-5 shrink-0 text-dimmed"
    />
  </NuxtLink>
</template>
