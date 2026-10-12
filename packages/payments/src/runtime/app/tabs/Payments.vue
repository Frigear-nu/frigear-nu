<script setup lang="ts">
import type { PaymentDto } from '../../../types'
import { formatMinorAmount } from '../utils/format'

defineOptions({ name: 'UsersAdminPayments' })

// The "Payments" tab of the `admin.users` area (`@frigear-nu/users`): every payment of the user, newest first.
const props = defineProps<{ user: { id: number } }>()

const t = useModuleT('payments.admin')
const status = useModuleT('payments.status')

const { data: payments } = await useFetch<PaymentDto[]>(
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
const date = (value: string | null) => value ? new Date(value).toLocaleString() : '–'
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-highlighted text-sm font-semibold">
      {{ t('title', 'Payments') }}
    </h2>
    <div
      v-if="payments?.length"
      class="border-default overflow-x-auto rounded-lg border"
    >
      <table class="w-full text-left text-sm">
        <thead class="text-muted bg-elevated/50 text-xs uppercase">
          <tr>
            <th class="px-3 py-2 font-medium">
              {{ t('date', 'Date') }}
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t('description', 'Description') }}
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t('amount', 'Amount') }}
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t('statusColumn', 'Status') }}
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t('refunded', 'Refunded') }}
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t('reference', 'Reference') }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-default divide-y">
          <tr
            v-for="payment in payments"
            :key="payment.id"
          >
            <td class="px-3 py-2 whitespace-nowrap">
              {{ date(payment.paidAt ?? payment.createdAt) }}
            </td>
            <td class="px-3 py-2">
              {{ payment.description ?? t('defaultDescription', 'Payment') }}
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              {{ formatMinorAmount(payment.amount, payment.currency) }}
            </td>
            <td class="px-3 py-2">
              <UBadge
                variant="subtle"
                :color="statusColors[payment.status] ?? 'neutral'"
                :label="statusLabel(payment.status)"
              />
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              {{ payment.refundedAmount ? formatMinorAmount(payment.refundedAmount, payment.currency) : '–' }}
            </td>
            <td class="text-muted px-3 py-2">
              {{ payment.referenceType ? `${payment.referenceType} ${payment.referenceId ?? ''}`.trim() : '–' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-else
      class="text-muted text-sm"
    >
      {{ t('empty', 'No payments yet.') }}
    </p>
  </div>
</template>
