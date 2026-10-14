<script setup lang="ts">
import type { PaymentDto } from '../../../types'
import { formatMoney } from '@frigear-nu/ui/money'

defineOptions({ name: 'PaymentsRecentTransactions' })

// List card for the `admin.dashboard.side` area: the latest settled or failed payments.
const t = useModuleT('payments.admin')
const status = useModuleT('payments.status')
const usersPage = useRuntimeConfig().public.users?.pages?.admin
const { data, status: fetchStatus } = useLazyFetch<{ items: (PaymentDto & { userName: string | null })[] }>('/api/payments/admin/recent', { key: 'admin-payments-recent' })

const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : '–'
const color = (value: string) => value === 'paid' ? 'success' : value === 'failed' ? 'error' : 'neutral'
const userTo = (id: number) => usersPage ? `${usersPage.replace(/\/+$/, '')}/${id}` : undefined
</script>

<template>
  <AdminListCard
    :title="t('recent', 'Recent transactions')"
    :loading="fetchStatus === 'pending' && !data"
    :is-empty="!data?.items.length"
    :empty="t('empty', 'No payments yet.')"
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
          {{ date(payment.paidAt ?? payment.createdAt) }}<template v-if="payment.description && payment.userName">
            · {{ payment.description }}
          </template>
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <span class="text-highlighted font-medium">{{ formatMoney(payment.amount, payment.currency) }}</span>
        <UBadge
          size="sm"
          variant="subtle"
          :color="color(payment.status)"
          :label="status(payment.status, payment.status)"
        />
      </div>
    </li>
  </AdminListCard>
</template>
