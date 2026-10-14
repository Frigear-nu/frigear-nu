<script setup lang="ts">
import { formatMoney } from '@frigear-nu/ui/money'

defineOptions({ name: 'PaymentsRevenueStat' })

// Stat card for the `admin.dashboard.top` area: what was paid in the last 30 days (the busiest currency).
const t = useModuleT('payments.admin')
const { data, status } = useLazyFetch<{ days: number, revenue: { currency: string, amount: number, count: number }[] }>('/api/payments/admin/recent', { key: 'admin-payments-recent' })
const main = computed(() => data.value?.revenue[0])
</script>

<template>
  <AdminStatCard
    :label="t('revenue', 'Revenue, 30 days')"
    icon="i-lucide-circle-dollar-sign"
    :loading="status === 'pending' && !data"
    :empty="t('noRevenue', 'No payments yet.')"
  >
    <template v-if="main">
      <span>{{ formatMoney(main.amount, main.currency) }}</span>
      <span class="text-muted text-sm font-normal">{{ t('transactions', '{count} transactions').replace('{count}', String(main.count)) }}</span>
    </template>
  </AdminStatCard>
</template>
