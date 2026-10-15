<script setup lang="ts">
import type { PaymentDto } from '../../../types'

defineOptions({ name: 'PaymentsRecentTransactions' })

// List card for the `admin.dashboard.side` area: the latest settled or failed payments. The "view all" link goes to
// the users list, where each user's payments are on their Payments tab.
const t = useModuleT('payments.admin')
const status = useModuleT('payments.status')
const format = useFormat()
const { localize } = useLocaleLink()
const usersPage = useRuntimeConfig().public.users?.pages?.admin
const usersPath = usersPage ? localize(usersPage.replace(/\/+$/, '')) : undefined
const { data, status: fetchStatus } = useLazyFetch<{ items: (PaymentDto & { userName: string | null })[] }>('/api/payments/admin/recent', { key: 'admin-payments-recent' })

const userTo = (id: number) => usersPath ? `${usersPath}/${id}` : undefined
</script>

<template>
  <ListCard
    :title="t('recent', 'Recent transactions')"
    :loading="fetchStatus === 'pending' && !data"
    :is-empty="!data?.items.length"
    :empty="t('empty', 'No payments yet')"
    :to="usersPath"
    :to-label="t('viewUsers', 'View users')"
  >
    <li
      v-for="payment in data?.items"
      :key="payment.id"
      class="flex items-center justify-between gap-3"
    >
      <div class="min-w-0">
        <NuxtLink
          v-if="userTo(payment.userId)"
          :to="userTo(payment.userId)"
          class="text-highlighted block truncate font-medium hover:underline"
        >
          {{ payment.userName ?? payment.description ?? t('defaultDescription', 'Payment') }}
        </NuxtLink>
        <span
          v-else
          class="text-highlighted block truncate font-medium"
        >{{ payment.userName ?? payment.description ?? t('defaultDescription', 'Payment') }}</span>
        <p class="text-muted truncate text-xs">
          {{ format.date(payment.paidAt ?? payment.createdAt) }}<template v-if="payment.description && payment.userName">
            · {{ payment.description }}
          </template>
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <span class="text-highlighted font-medium">{{ format.money(payment.amount, payment.currency) }}</span>
        <UBadge
          size="sm"
          variant="subtle"
          :color="statusColor(payment.status, { partially_refunded: 'warning' })"
          :label="status(payment.status, payment.status)"
        />
      </div>
    </li>
  </ListCard>
</template>
