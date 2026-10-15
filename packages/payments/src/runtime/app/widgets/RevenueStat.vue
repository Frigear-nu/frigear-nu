<script setup lang="ts">
defineOptions({ name: 'PaymentsRevenueStat' })

// Stat card for the `admin.dashboard.top` area: what was paid in the last 30 days (the busiest currency).
const t = useModuleT('payments.admin')
const format = useFormat()
const { data, status } = useLazyFetch<{ days: number, revenue: { currency: string, amount: number, count: number }[] }>('/api/payments/admin/recent', { key: 'admin-payments-recent' })
const main = computed(() => data.value?.revenue[0])
</script>

<template>
  <StatCard
    :label="t('revenue', 'Revenue, 30 days')"
    icon="i-lucide-circle-dollar-sign"
    :value="main ? format.money(main.amount, main.currency) : undefined"
    :hint="main ? t('transactions', '{count} transactions', { count: main.count }) : undefined"
    :loading="status === 'pending' && !data"
    :empty="t('noRevenue', 'No payments yet')"
  />
</template>
