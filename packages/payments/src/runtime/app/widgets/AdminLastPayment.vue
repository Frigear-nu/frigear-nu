<script setup lang="ts">
import type { PaymentDto } from '../../../types'

defineOptions({ name: 'UsersAdminLastPayment' })

// Summary card for the `admin.users.overview` widget area of the admin user page (`@frigear-nu/users`).
const props = defineProps<{ user: { id: number } }>()

const t = useModuleT('payments.admin')
const status = useModuleT('payments.status')
const format = useFormat()

// Lazy: the card shows a skeleton instead of holding up the rest of the page.
const { data: payments, status: fetchStatus } = useLazyFetch<PaymentDto[]>(
  () => `/api/admin/users/${props.user.id}/payments`,
  { key: () => `admin-last-payment-${props.user.id}`, query: { limit: 1 } },
)
const last = computed(() => payments.value?.[0])
const facts = computed(() => last.value
  ? [
      { key: 'amount', label: t('amount', 'Amount'), value: format.money(last.value.amount, last.value.currency) },
      { key: 'status', label: t('statusColumn', 'Status') },
      { key: 'date', label: t('date', 'Date'), value: format.date(last.value.paidAt ?? last.value.createdAt) },
    ]
  : [])
</script>

<template>
  <SectionCard
    :title="t('lastPayment', 'Last payment')"
    :loading="fetchStatus === 'pending' && !payments"
  >
    <DescriptionList
      v-if="last"
      :items="facts"
    >
      <template #status>
        <UBadge
          variant="subtle"
          :color="statusColor(last.status, { partially_refunded: 'warning' })"
          :label="status(last.status, last.status)"
        />
      </template>
    </DescriptionList>
    <UEmpty
      v-else
      icon="i-lucide-credit-card"
      variant="naked"
      :title="t('empty', 'No payments yet')"
    />
  </SectionCard>
</template>
