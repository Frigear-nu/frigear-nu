<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PaymentDto } from '../../../types'

defineOptions({ name: 'UsersAdminPayments' })

// The "Payments" tab of the `admin.users` area (`@frigear-nu/users`): every payment of the user, newest first.
// Read-only: there is no refund route, so rows have no menu.
const props = defineProps<{ user: { id: number } }>()

const t = useModuleT('payments.admin')
const status = useModuleT('payments.status')
const format = useFormat()

// Lazy, so the tab shell renders at once. `loading` is only the first load: a refresh keeps the rows on screen.
const { data: payments, status: fetchStatus, error } = useLazyFetch<PaymentDto[]>(
  () => `/api/admin/users/${props.user.id}/payments`,
  { key: () => `admin-payments-${props.user.id}` },
)

const loading = computed(() => fetchStatus.value === 'pending' && !payments.value)
const statusLabel = (value: string) => status(value, value)
const paymentDate = (payment: PaymentDto) => format.dateTime(payment.paidAt ?? payment.createdAt) || ''
const columns = computed<TableColumn<PaymentDto>[]>(() => [
  { accessorKey: 'createdAt', header: t('date', 'Date') },
  { accessorKey: 'description', header: t('description', 'Description') },
  { accessorKey: 'amount', header: t('amount', 'Amount') },
  { accessorKey: 'status', header: t('statusColumn', 'Status') },
  { accessorKey: 'refundedAmount', header: t('refunded', 'Refunded') },
  { accessorKey: 'referenceType', header: t('reference', 'Reference') },
])
</script>

<template>
  <TableCard
    :title="t('title', 'Payments')"
    :loading="loading"
    :refreshing="fetchStatus === 'pending' && !loading"
  >
    <UTable
      :data="payments ?? []"
      :columns="columns"
      :ui="tableUi({ tr: '' })"
    >
      <template #createdAt-cell="{ row }">
        <span
          v-if="paymentDate(row.original)"
          class="whitespace-nowrap tabular-nums"
        >{{ paymentDate(row.original) }}</span>
        <span
          v-else
          class="text-dimmed"
        >–</span>
      </template>
      <template #description-cell="{ row }">
        {{ row.original.description ?? t('defaultDescription', 'Payment') }}
      </template>
      <template #amount-cell="{ row }">
        <span class="whitespace-nowrap tabular-nums">{{ format.money(row.original.amount, row.original.currency) }}</span>
      </template>
      <template #status-cell="{ row }">
        <StatusBadge
          :status="row.original.status"
          :label="statusLabel(row.original.status)"
          :colors="{ partially_refunded: 'warning' }"
        />
      </template>
      <template #refundedAmount-cell="{ row }">
        <span
          v-if="row.original.refundedAmount"
          class="whitespace-nowrap tabular-nums"
        >{{ format.money(row.original.refundedAmount, row.original.currency) }}</span>
        <span
          v-else
          class="text-dimmed"
        >–</span>
      </template>
      <template #referenceType-cell="{ row }">
        <span
          v-if="row.original.referenceType"
          class="text-muted"
        >{{ `${row.original.referenceType} ${row.original.referenceId ?? ''}`.trim() }}</span>
        <span
          v-else
          class="text-dimmed"
        >–</span>
      </template>
      <template #empty>
        <UEmpty
          v-if="error"
          icon="i-lucide-circle-alert"
          variant="naked"
          :title="t('loadFailed', 'The payments could not be loaded')"
          :description="errorMessage(error, '')"
        />
        <UEmpty
          v-else
          icon="i-lucide-credit-card"
          variant="naked"
          :title="t('empty', 'No payments yet')"
        />
      </template>
    </UTable>
  </TableCard>
</template>
