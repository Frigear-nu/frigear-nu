<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PaymentDto } from '../../../types'
import { formatMoney as formatMinorAmount } from '@frigear-nu/ui/money'

defineOptions({ name: 'UsersAdminPayments' })

// The "Payments" tab of the `admin.users` area (`@frigear-nu/users`): every payment of the user, newest first.
const props = defineProps<{ user: { id: number } }>()

const t = useModuleT('payments.admin')
const status = useModuleT('payments.status')

const { data: payments, status: fetchStatus } = useLazyFetch<PaymentDto[]>(
  () => `/api/admin/users/${props.user.id}/payments`,
  { key: () => `admin-payments-${props.user.id}` },
)

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  paid: 'success',
  pending: 'warning',
  failed: 'error',
  expired: 'neutral',
  refunded: 'neutral',
  partially_refunded: 'warning',
}
const statusLabel = (value: string) => status(value, value)
const columns = computed<TableColumn<PaymentDto>[]>(() => [
  { accessorKey: 'createdAt', header: t('date', 'Date') },
  { accessorKey: 'description', header: t('description', 'Description') },
  { accessorKey: 'amount', header: t('amount', 'Amount') },
  { accessorKey: 'status', header: t('statusColumn', 'Status') },
  { accessorKey: 'refundedAmount', header: t('refunded', 'Refunded') },
  { accessorKey: 'referenceType', header: t('reference', 'Reference') },
])
const date = (value: string | null) => value ? new Date(value).toLocaleString() : '–'
</script>

<template>
  <AdminSection
    :title="t('title', 'Payments')"
  >
    <template #flush>
      <UTable
        :data="payments ?? []"
        :columns="columns"
        :loading="fetchStatus === 'pending'"
      >
        <template #createdAt-cell="{ row }">
          <span class="whitespace-nowrap">{{ date(row.original.paidAt ?? row.original.createdAt) }}</span>
        </template>
        <template #description-cell="{ row }">
          {{ row.original.description ?? t('defaultDescription', 'Payment') }}
        </template>
        <template #amount-cell="{ row }">
          <span class="whitespace-nowrap">{{ formatMinorAmount(row.original.amount, row.original.currency) }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            variant="subtle"
            :color="statusColors[row.original.status] ?? 'neutral'"
            :label="statusLabel(row.original.status)"
          />
        </template>
        <template #refundedAmount-cell="{ row }">
          <span class="whitespace-nowrap">{{ row.original.refundedAmount ? formatMinorAmount(row.original.refundedAmount, row.original.currency) : '–' }}</span>
        </template>
        <template #referenceType-cell="{ row }">
          <span class="text-muted">{{ row.original.referenceType ? `${row.original.referenceType} ${row.original.referenceId ?? ''}`.trim() : '–' }}</span>
        </template>
        <template #empty>
          <AdminEmpty
            icon="i-lucide-credit-card"
            :title="t('empty', 'No payments yet.')"
          />
        </template>
      </UTable>
    </template>
  </AdminSection>
</template>
