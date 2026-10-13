<script setup lang="ts">
import type { PaymentDto } from '../../../types'
import { formatMoney as formatMinorAmount } from '@frigear-nu/ui/money'

defineOptions({ name: 'UsersAdminLastPayment' })

// Summary card for the `admin.users.overview` widget area of the admin user page (`@frigear-nu/users`).
const props = defineProps<{ user: { id: number } }>()

const t = useModuleT('payments.admin')
const status = useModuleT('payments.status')

// Lazy: the card shows a skeleton instead of holding up the rest of the page.
const { data: payments, status: fetchStatus } = useLazyFetch<PaymentDto[]>(
  () => `/api/admin/users/${props.user.id}/payments`,
  { key: () => `admin-last-payment-${props.user.id}`, query: { limit: 1 } },
)
const last = computed(() => payments.value?.[0])
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : '–'
</script>

<template>
  <AdminStatCard
    :label="t('lastPayment', 'Last payment')"
    :empty="t('empty', 'No payments yet.')"
    :loading="fetchStatus === 'pending' && !payments"
  >
    <template v-if="last">
      <span class="text-highlighted font-medium">{{ formatMinorAmount(last.amount, last.currency) }}</span>
      <UBadge
        variant="subtle"
        :color="last.status === 'paid' ? 'success' : 'neutral'"
        :label="status(last.status, last.status)"
      />
      <span class="text-muted">{{ date(last.paidAt ?? last.createdAt) }}</span>
    </template>
  </AdminStatCard>
</template>
